require('dotenv').config();
const session = require('express-session');
const bcrypt  = require('bcrypt');
const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = 3000;

app.use(express.json());

app.use(session({
  secret: 'attendance-secret',
  resave: false,
  saveUninitialized: false
}));

// ─────────────────────────────────────────
// ADMIN AUTO CREATE
// ─────────────────────────────────────────
async function ensureAdmin() {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE username = $1',
    ['admin']
  );

  if (rows.length === 0) {
    const hashed = bcrypt.hashSync('admin123', 10);

    await db.query(
      'INSERT INTO users (username,password,role,staff_id) VALUES ($1,$2,$3,$4)',
      ['admin', hashed, 'admin', null]
    );

    console.log('Admin created → admin / admin123');
  }
}

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ success: false });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ success: false });
  next();
}

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const { rows } = await db.query(
    'SELECT * FROM users WHERE username=$1',
    [username]
  );

  const user = rows[0];
  if (!user) return res.status(401).json({ success:false });

  if (!bcrypt.compareSync(password, user.password))
    return res.status(401).json({ success:false });

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    staffId: user.staff_id
  };

  res.json({ success:true });
});

app.post('/api/logout', requireAuth, (req,res)=>{
  req.session.destroy();
  res.json({ success:true });
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
      data: rows.filter(s=>s.id===req.session.user.staffId)
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

app.post('/api/staff', requireAdmin, async (req,res)=>{
  const { id,name,dept,position } = req.body;

  if (!id || !name)
    return res.status(400).json({ success:false });

  await db.query(
    'INSERT INTO staff (id,name,dept,position) VALUES ($1,$2,$3,$4)',
    [id,name,dept||'',position||'']
  );

  const hashed = bcrypt.hashSync('sam123456',10);

  await db.query(
    'INSERT INTO users (username,password,role,staff_id) VALUES ($1,$2,$3,$4)',
    [id.toLowerCase(),hashed,'employee',id]
  );

  res.json({ success:true });
});

app.put('/api/staff/:id', requireAdmin, async (req,res)=>{
  const { id } = req.params;
  const { name,dept,position } = req.body;

  await db.query(
    'UPDATE staff SET name=$1,dept=$2,position=$3 WHERE id=$4',
    [name,dept||'',position||'',id]
  );

  res.json({ success:true });
});

app.delete('/api/staff/:id', requireAdmin, async (req,res)=>{
  const id = req.params.id;

  await db.query('DELETE FROM staff WHERE id=$1',[id]);
  await db.query('DELETE FROM users WHERE staff_id=$1',[id]);

  res.json({ success:true });
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
  rows.forEach(r=> map[r.staff_id]=r.status);

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

    if (!map[dateStr]) map[dateStr]={};
    map[dateStr][r.staff_id]=r.status;
  });

  res.json({ success:true, data:map });
});

app.post('/api/attendance', requireAdmin, async (req,res)=>{
  const { staffId,date,status } = req.body;

  await db.query(`
    INSERT INTO attendance (staff_id,date,status)
    VALUES ($1,$2,$3)
    ON CONFLICT (staff_id,date)
    DO UPDATE SET status=EXCLUDED.status, updated_at=NOW()
  `,[staffId,date,status]);

  res.json({ success:true });
});

app.delete('/api/attendance', requireAdmin, async (req,res)=>{
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


app.post('/api/holidays', requireAdmin, async (req,res)=>{
  const { date,name } = req.body;

  await db.query(`
    INSERT INTO holidays (date,name)
    VALUES ($1,$2)
    ON CONFLICT (date)
    DO UPDATE SET name=EXCLUDED.name
  `,[date,name||'']);

  res.json({ success:true });
});

app.delete('/api/holidays', requireAdmin, async (req,res)=>{
  const { date } = req.body;

  const result = await db.query(
    'DELETE FROM holidays WHERE date = $1',
    [date]
  );

  console.log("Deleted rows:", result.rowCount);

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
app.listen(PORT, async ()=>{
  console.log('─────────────────────────────────────────');
  console.log(`Running on http://localhost:${PORT}`);
  console.log('Database: Supabase PostgreSQL');
  console.log('─────────────────────────────────────────');

  await ensureAdmin();
});
