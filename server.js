const session = require('express-session');
const bcrypt  = require('bcrypt');
const express = require('express');
const path    = require('path');
const db      = require('./db');


const existingAdmin = db.getUserByUsername.get('admin');

if (!existingAdmin) {
  const hashed = bcrypt.hashSync('Samarraj@12', 10);
  db.insertUser.run('admin', hashed, 'admin', null);
  console.log('Admin created → admin / Samarraj@12');
}


const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  secret: 'attendance-local-secret',
  resave: false,
  saveUninitialized: false
}));

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  next();
}



// ═══════════════════════════════════════════════════════
// STAFF ROUTES
// ═══════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.getUserByUsername.get(username);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  req.session.user = {
  id: user.id,
  username: user.username,
  role: user.role,
  staffId: user.staff_id
};


  res.json({ success: true });
});

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/reset-password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }

    const user = db.getUserByUsername.get(req.session.user.username);

    const valid = bcrypt.compareSync(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password incorrect' });
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    db.updateUserPassword.run(hashed, user.id);

    res.json({ success: true, message: 'Password updated successfully' });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin → reset any user's password to default
app.post('/api/admin/reset-user-password', requireAdmin, (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const user = db.getUserById.get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const defaultPassword = 'sam123456';
    const hashed = bcrypt.hashSync(defaultPassword, 10);

    db.updateUserPassword.run(hashed, userId);

    res.json({
      success: true,
      message: `Password reset to default → ${defaultPassword}`
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// ═════════ HOLIDAYS ═════════

// list holidays
app.get('/api/holidays', requireAuth, (req, res) => {
  try {
    const rows = db.getHolidays.all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// add / update holiday
app.post('/api/holidays', requireAdmin, (req, res) => {
  try {
    const { date, name } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, error: 'date required' });
    }

    db.addHoliday.run(date, name || '');

    // AUTO MARK HOLIDAY FOR ALL STAFF
    const allStaff = db.getAllStaff.all();

    allStaff.forEach(s => {
      db.upsertAttendance.run(s.id, date, 'holiday');
    });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// delete holiday
app.delete('/api/holidays', requireAdmin, (req, res) => {
  try {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({ success: false, error: 'date required' });
    }
    db.deleteHoliday.run(date);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET → list all staff
app.get('/api/staff', requireAuth, (req, res) => {
  try {
    const allStaff = db.getAllStaff.all();

    // 🔒 If employee → only return their own staff record
    if (req.session.user.role === 'employee') {
      const filtered = allStaff.filter(
        s => s.id === req.session.user.staffId
      );

      return res.json({ success: true, data: filtered });
    }

    // Admin sees all
    res.json({ success: true, data: allStaff });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// GET → department names
app.get('/api/staff/departments', requireAuth, (req, res) => {
  try {
    const rows = db.getDepartments.all();
    res.json({ success: true, data: rows.map(r => r.dept) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST → add staff
app.post('/api/staff', requireAdmin, (req, res) => {
  try {
    const { id, name, dept, position } = req.body;

    if (!id || !name) {
      return res.status(400).json({ success: false, error: 'id and name required' });
    }

    if (db.getStaffById.get(id)) {
      return res.status(409).json({ success: false, error: 'Staff ID exists' });
    }

    // 1️⃣ Insert into staff table
    db.insertStaff.run(id, name, dept || '', position || '');

    // 2️⃣ Auto-create employee login
    const username = id.toLowerCase(); // example: emp001
    const defaultPassword = 'sam123456';  // temporary password
    const hashed = bcrypt.hashSync(defaultPassword, 10);

    db.insertUser.run(username, hashed, 'employee', id);

    res.status(201).json({
      success: true,
      message: `Staff added. Login → ${username} / ${defaultPassword}`
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// PUT → update
app.put('/api/staff/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, dept, position } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    // must exist
    if (!db.getStaffById.get(id)) {
      return res.status(404).json({ success: false, error: 'Staff not found' });
    }

    db.updateStaff.run(name, dept || '', position || '', id);
    res.json({ success: true, message: 'Staff updated' });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE → remove staff
app.delete('/api/staff/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    if (!db.getStaffById.get(id)) {
      return res.status(404).json({ success: false, error: 'Staff not found' });
    }

    // 1️⃣ Delete staff
    db.deleteStaff.run(id);

   // 2️⃣ Delete linked user account

    db.deleteUserByStaffId.run(id);


    res.json({ success: true, message: 'Staff and user account deleted' });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ═══════════════════════════════════════════════════════
// ATTENDANCE ROUTES
// ═══════════════════════════════════════════════════════

app.get('/api/attendance', requireAuth, (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, error: 'date query param required' });
    }

    const dateObj = new Date(date);
    const isSunday = dateObj.getDay() === 0;

    // 🔎 Check if holiday
    const holiday = db.getHolidayByDate.get(date)

    const allStaff = db.getAllStaff.all();
    const existingRows = db.getAttendanceByDate.all(date);

    const existingMap = {};
    existingRows.forEach(r => {
      existingMap[r.staff_id] = r.status;
    });

    allStaff.forEach(s => {
      if (!existingMap[s.id]) {

        if (holiday) {
          db.upsertAttendance.run(s.id, date, 'holiday');
        } 
        else if (isSunday) {
          db.upsertAttendance.run(s.id, date, 'weekend');
        }

      }
    });

    const rows = db.getAttendanceByDate.all(date);
    const map = {};
    rows.forEach(r => { map[r.staff_id] = r.status; });

    res.json({ success: true, data: map });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



app.get('/api/attendance/month', requireAuth, (req, res) => {
  try {
    const year  = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ success: false, error: 'year and month required' });
    }

    const mm   = String(month + 1).padStart(2, '0');
    const from = `${year}-${mm}-01`;
    const last = new Date(year, month + 1, 0).getDate();
    const to   = `${year}-${mm}-${String(last).padStart(2, '0')}`;

    const allStaff = db.getAllStaff.all();

    // 🔥 AUTO MARK ALL SUNDAYS
    for (let d = 1; d <= last; d++) {
      const dateObj = new Date(year, month, d);
      if (dateObj.getDay() === 0) { // Sunday

        const dateStr = `${year}-${mm}-${String(d).padStart(2, '0')}`;

        allStaff.forEach(s => {

          const existing = db.getAttendanceByDate.all(dateStr)
            .find(r => r.staff_id === s.id);

          if (!existing) {
            db.upsertAttendance.run(s.id, dateStr, 'weekend');
          }
        });
      }
    }

    // Now fetch updated data
    const rows = db.getAttendanceByMonth.all(from, to);

    const map = {};

    rows.forEach(r => {

      if (req.session.user.role === 'employee' &&
          r.staff_id !== req.session.user.staffId) {
        return;
      }

      if (!map[r.date]) map[r.date] = {};
      map[r.date][r.staff_id] = r.status;
    });

    res.json({ success: true, data: map });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Employee — get only their own attendance
app.get('/api/my-report', requireAuth, (req, res) => {
  try {
    if (req.session.user.role !== 'employee') {
      return res.status(403).json({ success: false, error: 'Employees only' });
    }

    const staffId = req.session.user.staffId;

    const year  = parseInt(req.query.year);
    const month = parseInt(req.query.month);

    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ success: false, error: 'year and month required' });
    }

    const mm   = String(month + 1).padStart(2, '0');
    const from = `${year}-${mm}-01`;
    const last = new Date(year, month + 1, 0).getDate();
    const to   = `${year}-${mm}-${String(last).padStart(2, '0')}`;

    const rows = db.getAttendanceByMonth.all(from, to)
                   .filter(r => r.staff_id === staffId);

    res.json({ success: true, data: rows });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST → save attendance
app.post('/api/attendance', requireAdmin, (req, res) => {
  try {
    const { staffId, date, status } = req.body;

    if (!staffId || !date || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'staffId, date, and status are required' 
      });
    }

    // 🔎 Check if date is holiday
    const holiday = db.getHolidayByDate.get(date)

    // 🔎 Check if weekend (Sunday)
    const d = new Date(date);
    const isSunday = d.getDay() === 0;

    // 🚫 Override manual marking if holiday/weekend
    if (holiday) {
      db.upsertAttendance.run(staffId, date, 'holiday');
    } 
    else if (isSunday) {
      db.upsertAttendance.run(staffId, date, 'weekend');
    } 
    else {
      db.upsertAttendance.run(staffId, date, status);
    }

    res.json({ success: true, message: 'Attendance saved' });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// DELETE → remove attendance
app.delete('/api/attendance', requireAdmin, (req, res) => {
  try {
    const { staffId, date } = req.body;

    if (!staffId || !date) {
      return res.status(400).json({ success: false, error: 'staffId and date are required' });
    }

    db.deleteAttendance.run(staffId, date);
    res.json({ success: true, message: 'Attendance removed' });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// Get current logged-in user
app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.session.user
  });
});


// fallback

// 🔐 Control home route FIRST
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// THEN allow static files
app.use(express.static(path.join(__dirname, 'public')));

// start
app.listen(PORT, () => {
  console.log('─────────────────────────────────────────');
  console.log('  Staff Attendance Manager');
  console.log(`  Running on: http://localhost:${PORT}`);
  console.log('  Database:   attendance.db');
  console.log('─────────────────────────────────────────');
});