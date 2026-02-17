require('dotenv').config();

const session = require('express-session');
const bcrypt  = require('bcrypt');
const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT for Render / reverse proxy
app.set('trust proxy', 1);

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// ─────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session.user)
      return res.status(401).json({ success: false });

    if (!allowedRoles.includes(req.session.user.role))
      return res.status(403).json({ success: false });

    next();
  };
}

// ─────────────────────────────────────────
// ENV ADMIN CREATION
// ─────────────────────────────────────────

async function ensureAdmin() {
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPass) return;

  const cleanUsername = adminUser.toLowerCase();

  const { rows } = await db.query(
    'SELECT id FROM users WHERE username=$1',
    [cleanUsername]
  );

  if (rows.length === 0) {
    const hashed = await bcrypt.hash(adminPass, 10);

    await db.query(
      'INSERT INTO users (username,password,role,staff_id) VALUES ($1,$2,$3,$4)',
      [cleanUsername, hashed, 'admin', null]
    );

    console.log('Admin created from ENV');
  }
}

// ─────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success:false });
    }

    const cleanUsername = username.trim().toLowerCase();

    const { rows } = await db.query(
      'SELECT * FROM users WHERE username=$1',
      [cleanUsername]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success:false });
    }

    const user = rows[0];

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ success:false });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      staffId: user.staff_id
    };

    res.json({ success:true, role:user.role });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success:false });
  }
});

app.post('/api/logout', requireAuth, (req,res)=>{
  req.session.destroy(()=>{
    res.json({ success:true });
  });
});

app.get('/api/me', requireAuth, (req,res)=>{
  res.json({ success:true, user:req.session.user });
});

// ─────────────────────────────────────────
// STAFF
// ─────────────────────────────────────────

app.get('/api/staff', requireAuth, async (req,res)=>{
  const { rows } = await db.query(
    'SELECT * FROM staff ORDER BY name ASC'
  );

  if (req.session.user.role === 'employee') {
    return res.json({
      success:true,
      data: rows.filter(s => s.id === req.session.user.staffId)
    });
  }

  res.json({ success:true, data:rows });
});

app.get('/api/staff/departments', requireAuth, async (req,res)=>{
  const { rows } = await db.query(
    "SELECT DISTINCT dept FROM staff WHERE dept != '' ORDER BY dept ASC"
  );
  res.json({ success:true, data:rows.map(r=>r.dept) });
});

app.post('/api/staff', requireRole(['admin']), async (req,res)=>{
  try {
    const { id,name,dept,position,role } = req.body;

    if (!id || !name)
      return res.status(400).json({ success:false });

    const safeRole = ['admin','manager','employee'].includes(role)
      ? role
      : 'employee';

    await db.query(
      'INSERT INTO staff (id,name,dept,position) VALUES ($1,$2,$3,$4)',
      [id,name,dept||'',position||'']
    );

    const tempPassword = process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123';
    const hashed = await bcrypt.hash(tempPassword,10);

    await db.query(
      'INSERT INTO users (username,password,role,staff_id) VALUES ($1,$2,$3,$4)',
      [id.toLowerCase(),hashed,safeRole,id]
    );

    res.json({ success:true });

  } catch(err){
    console.error(err);
    res.status(500).json({ success:false });
  }
});

app.put('/api/staff/:id', requireRole(['admin']), async (req,res)=>{
  const { id } = req.params;
  const { name,dept,position } = req.body;

  await db.query(
    'UPDATE staff SET name=$1,dept=$2,position=$3 WHERE id=$4',
    [name,dept||'',position||'',id]
  );

  res.json({ success:true });
});

app.delete('/api/staff/:id', requireRole(['admin']), async (req,res)=>{
  const id = req.params.id;

  await db.query('DELETE FROM staff WHERE id=$1',[id]);
  await db.query('DELETE FROM users WHERE staff_id=$1',[id]);

  res.json({ success:true });
});

// ─────────────────────────────────────────
// ADMIN RESET USER PASSWORD
// ─────────────────────────────────────────
app.post('/api/admin/reset-user-password', requireRole(['admin']), async (req, res) => {
  try {
    const { staffId } = req.body;

    const cleanUsername = staffId.toLowerCase();

    const tempPassword = process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123';
    const hashed = await bcrypt.hash(tempPassword, 10);

    const before = await db.query(
      'SELECT password FROM users WHERE username=$1',
      [cleanUsername]
    );

    console.log("BEFORE HASH:", before.rows[0]?.password);

    const result = await db.query(
      'UPDATE users SET password=$1 WHERE username=$2',
      [hashed, cleanUsername]
    );

    console.log("Rows updated:", result.rowCount);

    const after = await db.query(
      'SELECT password FROM users WHERE username=$1',
      [cleanUsername]
    );

    console.log("AFTER HASH:", after.rows[0]?.password);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────
// USER CHANGE OWN PASSWORD
// ─────────────────────────────────────────

app.post('/api/reset-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false });
    }

    const { rows } = await db.query(
      'SELECT * FROM users WHERE id=$1',
      [req.session.user.id]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false });
    }

    const user = rows[0];

    const valid = await bcrypt.compare(currentPassword, user.password);

    if (!valid) {
      return res.status(401).json({ success: false, error: 'Incorrect current password' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await db.query(
      'UPDATE users SET password=$1 WHERE id=$2',
      [hashed, user.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ success: false });
  }
});


// ─────────────────────────────────────────
// ATTENDANCE
// ─────────────────────────────────────────

app.get('/api/attendance', requireAuth, async (req,res)=>{
  const { date } = req.query;

  const { rows } = await db.query(
    'SELECT staff_id,status FROM attendance WHERE date=$1',
    [date]
  );

  const map = {};
  rows.forEach(r => map[r.staff_id] = r.status);

  res.json({ success:true, data:map });
});

app.get('/api/attendance/month', requireAuth, async (req,res)=>{
  const { year,month } = req.query;

  const mm   = String(parseInt(month)+1).padStart(2,'0');
  const from = `${year}-${mm}-01`;
  const last = new Date(year,parseInt(month)+1,0).getDate();
  const to   = `${year}-${mm}-${String(last).padStart(2,'0')}`;

  const { rows } = await db.query(
    'SELECT staff_id,date,status FROM attendance WHERE date >= $1 AND date <= $2',
    [from,to]
  );

  const map = {};

  rows.forEach(r=>{
    const dateStr = new Date(r.date).toISOString().split('T')[0];
    if (!map[dateStr]) map[dateStr] = {};
    map[dateStr][r.staff_id] = r.status;
  });

  res.json({ success:true, data:map });
});

app.post('/api/attendance', requireRole(['admin','manager']), async (req,res)=>{
  const { staffId,date,status } = req.body;

  await db.query(`
    INSERT INTO attendance (staff_id,date,status)
    VALUES ($1,$2,$3)
    ON CONFLICT (staff_id,date)
    DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()
  `,[staffId,date,status]);

  res.json({ success:true });
});

app.delete('/api/attendance', requireRole(['admin','manager']), async (req,res)=>{
  const { staffId,date } = req.body;

  await db.query(
    'DELETE FROM attendance WHERE staff_id=$1 AND date=$2',
    [staffId,date]
  );

  res.json({ success:true });
});

// ─────────────────────────────────────────
// HOLIDAYS
// ─────────────────────────────────────────

app.get('/api/holidays', requireAuth, async (req,res)=>{
  const { rows } = await db.query(
    "SELECT TO_CHAR(date, 'YYYY-MM-DD') as date, name FROM holidays ORDER BY date"
  );

  res.json({ success:true, data:rows });
});

app.post('/api/holidays', requireRole(['admin']), async (req,res)=>{
  const { date,name } = req.body;

  await db.query(`
    INSERT INTO holidays (date,name)
    VALUES ($1,$2)
    ON CONFLICT (date)
    DO UPDATE SET name=EXCLUDED.name
  `,[date,name||'']);

  res.json({ success:true });
});

app.delete('/api/holidays', requireRole(['admin']), async (req,res)=>{
  const { date } = req.body;

  await db.query(
    'DELETE FROM holidays WHERE date=$1',
    [date]
  );

  res.json({ success:true });
});

// ─────────────────────────────────────────
// STATIC
// ─────────────────────────────────────────

app.get('/', (req,res)=>{
  if (!req.session.user)
    return res.sendFile(path.join(__dirname,'public','login.html'));
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.use(express.static(path.join(__dirname,'public')));

// ─────────────────────────────────────────
// START
// ─────────────────────────────────────────
app.get('/api/health', (req,res)=>{
  res.json({ status: 'ok' });
});

app.listen(PORT, async ()=>{
  await ensureAdmin();
  console.log(`Server running on port ${PORT}`);
});
