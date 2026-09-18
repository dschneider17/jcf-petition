require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool, initSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12, httpOnly: true }, // 12 hours
  })
);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// ---------- Presentation helpers (mirror the design's card logic) ----------
//
// The app now only collects nonprofit signers asking for ACH linkage to a
// Chariot deposit account. Historical donor / DAFpay rows (from before the
// 2026-09 simplification) are left in the database untouched, but are
// excluded from these public-facing queries — see `pre-simplification-donor-dafpay`
// git tag/branch to bring that flow back if needed.

function initialsFor(s) {
  if (s.anonymous) return 'A';
  return (s.nonprofit_name || '?').trim().charAt(0).toUpperCase() || '?';
}

function displayNameFor(s) {
  if (s.anonymous) return 'Anonymous';
  return s.nonprofit_name || '';
}

function displaySubtitleFor(s) {
  if (s.anonymous) return '';
  return [s.signer_name, s.signer_role].filter(Boolean).join(', ');
}

function presentSigner(s) {
  return {
    ...s,
    initials: initialsFor(s),
    displayName: displayNameFor(s),
    displaySubtitle: displaySubtitleFor(s),
  };
}

// Counts shown on the sign-form stat box and the Voices Wall.
async function getCounts() {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('approved','pending') AND type = 'nonprofit') AS total_count
    FROM signers
  `);
  return result.rows[0];
}

// The "Masbia, Yeshiva University & 45 others" caption + avatar chips on the sign card.
function buildAvatarStack(approvedSigners) {
  const named = approvedSigners.filter((s) => !s.anonymous && s.displayName);
  const chips = named.slice(0, 4).map((s) => s.initials);
  const firstTwoNames = named.slice(0, 2).map((s) => s.displayName);
  const remaining = approvedSigners.length - firstTwoNames.length;
  let caption = '';
  if (firstTwoNames.length === 0) {
    caption = approvedSigners.length > 0 ? `${approvedSigners.length} voices so far` : 'Be the first to add your voice';
  } else if (remaining > 0) {
    caption = `${firstTwoNames.join(', ')} & ${remaining} others`;
  } else {
    caption = firstTwoNames.join(', ');
  }
  return { chips, caption };
}

async function getHomeLocals(overrides = {}) {
  const [approvedResult, countsRow] = await Promise.all([
    pool.query(`SELECT * FROM signers WHERE status = 'approved' AND type = 'nonprofit' ORDER BY created_at DESC`),
    getCounts(),
  ]);
  const approved = approvedResult.rows.map(presentSigner);
  const { chips, caption } = buildAvatarStack(approved);

  return {
    teaserSigners: approved.slice(0, 5),
    counts: countsRow,
    avatarChips: chips,
    avatarCaption: caption,
    error: null,
    formData: {},
    submitted: false,
    ...overrides,
  };
}

// ---------- Public site ----------

app.get('/', async (req, res, next) => {
  try {
    const locals = await getHomeLocals({ submitted: req.query.submitted === '1' });
    res.render('index', locals);
  } catch (err) {
    next(err);
  }
});

app.post('/sign', async (req, res, next) => {
  try {
    const anonymous = req.body.anonymous === 'on';

    const nonprofit_name = (req.body.nonprofit_name || '').trim();
    const signer_name = (req.body.signer_name || '').trim();
    const signer_role = (req.body.signer_role || '').trim();
    const blurb = (req.body.why || '').trim();

    let error = null;
    if (!anonymous) {
      if (!nonprofit_name || !signer_name || !signer_role || !blurb) {
        error = 'Please fill in every field.';
      }
    }

    if (error) {
      const locals = await getHomeLocals({ error, formData: req.body });
      return res.status(400).render('index', locals);
    }

    await pool.query(
      `INSERT INTO signers
        (nonprofit_name, signer_name, signer_role, blurb, wants_dafpay, wants_gift_processing, status, type, anonymous)
       VALUES ($1,$2,$3,$4,false,true,'pending','nonprofit',$5)`,
      [
        anonymous ? null : nonprofit_name || null,
        anonymous ? null : signer_name || null,
        anonymous ? null : signer_role || null,
        blurb || null,
        anonymous,
      ]
    );

    res.redirect('/?submitted=1');
  } catch (err) {
    next(err);
  }
});

app.get('/voices', async (req, res, next) => {
  try {
    const [approvedResult, countsRow] = await Promise.all([
      pool.query(`SELECT * FROM signers WHERE status = 'approved' AND type = 'nonprofit' ORDER BY created_at DESC`),
      getCounts(),
    ]);
    const approvedSigners = approvedResult.rows.map(presentSigner);
    res.render('voices', { approvedSigners, counts: countsRow });
  } catch (err) {
    next(err);
  }
});

// ---------- Admin ----------

app.get('/admin/login', (req, res) => {
  res.render('admin-login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.status(401).render('admin-login', { error: 'Incorrect password.' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const filter = req.query.status || 'all';
    const [allResult, countsResult] = await Promise.all([
      pool.query('SELECT * FROM signers ORDER BY created_at DESC'),
      pool.query(`
        SELECT
          COUNT(*) AS all_count,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
          COUNT(*) FILTER (WHERE status = 'hidden') AS hidden_count
        FROM signers
      `),
    ]);
    const all = allResult.rows;
    const visible = filter === 'all' ? all : all.filter((s) => s.status === filter);
    const rows = visible.map((s) => ({
      ...s,
      isPending: s.status === 'pending',
      isApproved: s.status === 'approved',
      isHidden: s.status === 'hidden',
      canApprove: s.status !== 'approved',
      canHide: s.status !== 'hidden',
      displayNonprofit: s.type === 'donor' ? s.signer_name || 'Anonymous donor' : s.nonprofit_name || 'Anonymous',
    }));
    res.render('admin-dashboard', { rows, filter, statusCounts: countsResult.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/signer/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM signers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/admin');
    res.render('admin-edit', { signer: result.rows[0], saved: req.query.saved === '1' });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/signer/:id', requireAdmin, async (req, res, next) => {
  try {
    const {
      logo_url,
      mission_statement,
      admin_note,
      status,
      nonprofit_name,
      signer_name,
      blurb,
      years_as_account_holder,
    } = req.body;
    await pool.query(
      `UPDATE signers SET
        logo_url = $1,
        mission_statement = $2,
        admin_note = $3,
        status = $4,
        nonprofit_name = $5,
        signer_name = $6,
        blurb = $7,
        years_as_account_holder = $8,
        updated_at = now()
       WHERE id = $9`,
      [
        (logo_url || '').trim() || null,
        (mission_statement || '').trim() || null,
        (admin_note || '').trim() || null,
        status,
        (nonprofit_name || '').trim() || null,
        (signer_name || '').trim() || null,
        (blurb || '').trim() || null,
        (years_as_account_holder || '').trim() || null,
        req.params.id,
      ]
    );
    res.redirect(`/admin/signer/${req.params.id}?saved=1`);
  } catch (err) {
    next(err);
  }
});

app.post('/admin/signer/:id/status', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('UPDATE signers SET status = $1, updated_at = now() WHERE id = $2', [
      req.body.status,
      req.params.id,
    ]);
    res.redirect(req.get('Referrer') || '/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/signer/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM signers WHERE id = $1', [req.params.id]);
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

// ---------- Errors ----------

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong. Please try again.');
});

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`JCF Connectivity site listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
