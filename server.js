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

// ---------- Public site ----------

app.get('/', async (req, res, next) => {
  try {
    const approvedResult = await pool.query(
      `SELECT * FROM signers WHERE status = 'approved' ORDER BY created_at DESC`
    );
    const countsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('approved','pending')) AS total,
        COUNT(*) FILTER (WHERE status IN ('approved','pending') AND wants_dafpay) AS dafpay_count,
        COUNT(*) FILTER (WHERE status IN ('approved','pending') AND wants_gift_processing) AS gp_count
      FROM signers
    `);
    res.render('index', {
      signers: approvedResult.rows,
      counts: countsResult.rows[0],
      submitted: req.query.submitted === '1',
      error: null,
      formData: {},
    });
  } catch (err) {
    next(err);
  }
});

app.post('/sign', async (req, res, next) => {
  try {
    const {
      nonprofit_name,
      signer_name,
      signer_role,
      email,
      blurb,
      website_url,
    } = req.body;

    const wants_dafpay = req.body.wants_dafpay === 'on';
    const wants_gift_processing = req.body.wants_gift_processing === 'on';

    if (!nonprofit_name || !signer_name || !signer_role || !email || !blurb) {
      const approvedResult = await pool.query(
        `SELECT * FROM signers WHERE status = 'approved' ORDER BY created_at DESC`
      );
      const countsResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('approved','pending')) AS total,
          COUNT(*) FILTER (WHERE status IN ('approved','pending') AND wants_dafpay) AS dafpay_count,
          COUNT(*) FILTER (WHERE status IN ('approved','pending') AND wants_gift_processing) AS gp_count
        FROM signers
      `);
      return res.status(400).render('index', {
        signers: approvedResult.rows,
        counts: countsResult.rows[0],
        submitted: false,
        error: 'Please fill in every field, and check at least one box.',
        formData: req.body,
      });
    }

    if (!wants_dafpay && !wants_gift_processing) {
      const approvedResult = await pool.query(
        `SELECT * FROM signers WHERE status = 'approved' ORDER BY created_at DESC`
      );
      const countsResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('approved','pending')) AS total,
          COUNT(*) FILTER (WHERE status IN ('approved','pending') AND wants_dafpay) AS dafpay_count,
          COUNT(*) FILTER (WHERE status IN ('approved','pending') AND wants_gift_processing) AS gp_count
        FROM signers
      `);
      return res.status(400).render('index', {
        signers: approvedResult.rows,
        counts: countsResult.rows[0],
        submitted: false,
        error: 'Please check at least one box for which connection matters to you.',
        formData: req.body,
      });
    }

    await pool.query(
      `INSERT INTO signers
        (nonprofit_name, signer_name, signer_role, email, blurb, website_url, wants_dafpay, wants_gift_processing, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
      [nonprofit_name.trim(), signer_name.trim(), signer_role.trim(), email.trim(), blurb.trim(), (website_url || '').trim(), wants_dafpay, wants_gift_processing]
    );

    res.redirect('/?submitted=1');
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
    let query = 'SELECT * FROM signers';
    const params = [];
    if (['pending', 'approved', 'hidden'].includes(filter)) {
      query += ' WHERE status = $1';
      params.push(filter);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.render('admin-dashboard', { signers: result.rows, filter });
  } catch (err) {
    next(err);
  }
});

app.get('/admin/signer/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM signers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.redirect('/admin');
    res.render('admin-edit', { signer: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/signer/:id', requireAdmin, async (req, res, next) => {
  try {
    const { logo_url, mission_statement, admin_note, status, nonprofit_name, blurb } = req.body;
    await pool.query(
      `UPDATE signers SET
        logo_url = $1,
        mission_statement = $2,
        admin_note = $3,
        status = $4,
        nonprofit_name = $5,
        blurb = $6,
        updated_at = now()
       WHERE id = $7`,
      [
        (logo_url || '').trim() || null,
        (mission_statement || '').trim() || null,
        (admin_note || '').trim() || null,
        status,
        nonprofit_name,
        blurb,
        req.params.id,
      ]
    );
    res.redirect('/admin');
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
    app.listen(PORT, () => console.log(`JCF petition site listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
