const Database = require('better-sqlite3');
const path      = require('path');


// ─── DB FILE lives in the same folder as server.js ───
const DB_PATH = path.join(__dirname, 'attendance.db');
const db      = new Database(DB_PATH);

// ─── Performance tweaks ───
db.pragma('journal_mode = DELETE');
db.pragma('foreign_keys = ON');

// ═══════════════ CREATE TABLES ═══════════════
db.exec(`

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  staff_id TEXT
);

  CREATE TABLE IF NOT EXISTS staff (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    dept      TEXT DEFAULT '',
    position  TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS holidays (
  date TEXT PRIMARY KEY,
  name TEXT
);

  CREATE TABLE IF NOT EXISTS attendance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id   TEXT    NOT NULL,
    date       TEXT    NOT NULL,          -- YYYY-MM-DD
    status     TEXT    NOT NULL,          -- present | absent | halfday | holiday | weekend
    updated_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
    UNIQUE(staff_id, date)               -- one status per staff per day
  );
`);

// ═══════════════ STAFF QUERIES ═══════════════
const getAllStaff       = db.prepare('SELECT * FROM staff ORDER BY name ASC');
const getStaffById      = db.prepare('SELECT * FROM staff WHERE id = ?');
const insertStaff       = db.prepare('INSERT INTO staff (id, name, dept, position) VALUES (?, ?, ?, ?)');
const updateStaff       = db.prepare('UPDATE staff SET name = ?, dept = ?, position = ? WHERE id = ?');
const deleteStaff       = db.prepare('DELETE FROM staff WHERE id = ?');
const getDepartments    = db.prepare("SELECT DISTINCT dept FROM staff WHERE dept != '' ORDER BY dept ASC");

// ═══════════════ ATTENDANCE QUERIES ═══════════════
// Get all attendance records for a given date
const getAttendanceByDate = db.prepare(
  'SELECT staff_id, status FROM attendance WHERE date = ?'
);

// ═══════════════ HOLIDAY QUERIES ═══════════════
const getHolidays = db.prepare(
  'SELECT date, name FROM holidays ORDER BY date'
);

const addHoliday = db.prepare(
  'INSERT OR REPLACE INTO holidays (date, name) VALUES (?, ?)'
);

const deleteHolidayByDate = db.prepare(
  'DELETE FROM holidays WHERE date = ?'
);

// Upsert: insert or replace attendance for a staff+date
const upsertAttendance = db.prepare(`
  INSERT INTO attendance (staff_id, date, status)
  VALUES (?, ?, ?)
  ON CONFLICT(staff_id, date)
  DO UPDATE SET status = excluded.status, updated_at = datetime('now')
`);

// Delete a single attendance record (toggle-off)
const deleteAttendance = db.prepare(
  'DELETE FROM attendance WHERE staff_id = ? AND date = ?'
);

// Get full month data: all records between two dates
const getAttendanceByMonth = db.prepare(
  
  'SELECT staff_id, date, status FROM attendance WHERE date >= ? AND date <= ? ORDER BY date ASC'
);
// ═══════════════ USER QUERIES ═══════════════

const updateUserPassword = db.prepare(
  'UPDATE users SET password = ? WHERE id = ?'
);

const getUserById = db.prepare(
  'SELECT * FROM users WHERE id = ?'
);

const getUserByUsername = db.prepare(
  'SELECT * FROM users WHERE username = ?'
);

const insertUser = db.prepare(
  'INSERT INTO users (username, password, role, staff_id) VALUES (?, ?, ?, ?)'
);
const deleteUserByStaffId = db.prepare(
  'DELETE FROM users WHERE staff_id = ?'
);

const getHolidayByDate = db.prepare(
  'SELECT * FROM holidays WHERE date = ?'
);


// ═══════════════ EXPORTS ═══════════════
module.exports = {
  // staff
  getAllStaff,
  getStaffById,
  insertStaff,
  updateStaff,
  deleteStaff,
  getDepartments,

  // attendance
  getAttendanceByDate,
  upsertAttendance,
  deleteAttendance,
  getAttendanceByMonth,

  // holidays
  getHolidays,
  addHoliday,
  getHolidayByDate,
  deleteHoliday: deleteHolidayByDate,
  



  // users
  getUserByUsername,
  insertUser,
  deleteUserByStaffId,
  updateUserPassword,
  getUserById,



};