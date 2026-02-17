# 📊 Staff Attendance Manager

A full-stack role-based attendance management system built with:

- Node.js + Express
- PostgreSQL (Supabase)
- Session-based Authentication
- Role-Based Access Control (Admin / Manager / Employee)
- Mobile-Optimized UI

Live Demo:
https://staff-attendance-manager.onrender.com

---

## 🚀 Features

### 🔐 Authentication
- Secure session-based login
- bcrypt password hashing
- Admin-controlled password reset
- User self password change

### 👥 Role-Based Access Control

| Feature | Admin | Manager | Employee |
|----------|--------|----------|------------|
| Dashboard | ✅ | ✅ | ✅ |
| Mark Attendance | ✅ | ✅ | ❌ |
| Staff Management | ✅ | ❌ | ❌ |
| Holiday Management | ✅ | ❌ | ❌ |
| Monthly Report | ✅ | ✅ | Own Only |
| Monthly Overview | ✅ | ✅ | ✅ |

---

## 🏗 Tech Stack

Backend:
- Express.js
- PostgreSQL (Supabase)
- express-session
- bcrypt

Frontend:
- Vanilla JavaScript
- Fetch API
- Mobile-optimized UI

Deployment:
- Render (Web Service)
- Supabase (Database)

---

## ⚙️ Environment Variables

Create a `.env` file locally:

```

DATABASE_URL=your_supabase_connection_string
SESSION_SECRET=long_random_string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=StrongPasswordHere
DEFAULT_USER_PASSWORD=ChangeMe123

```

⚠ Never commit `.env` to GitHub.

On Render:
Add the same variables under **Environment → Add Variable**.

---

## 🛠 Installation (Local Setup)

1. Clone repository:

```

git clone [https://github.com/samarrajx/staff-attendance-manager.git](https://github.com/samarrajx/staff-attendance-manager.git)
cd staff-attendance-manager

```

2. Install dependencies:

```

npm install

```

3. Start server:

```

npm start

```

4. Open:

```

[http://localhost:3000](http://localhost:3000)

````

---

## 🗄 Database Structure

### users

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  staff_id TEXT
);
````

### staff

```sql
CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dept TEXT,
  position TEXT
);
```

### attendance

```sql
CREATE TABLE attendance (
  staff_id TEXT,
  date DATE,
  status TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (staff_id, date)
);
```

### holidays

```sql
CREATE TABLE holidays (
  date DATE PRIMARY KEY,
  name TEXT
);
```

---

## 🔒 Security Design

* Passwords hashed with bcrypt
* Session cookies (httpOnly)
* Role-based middleware protection
* Backend validation for all protected routes
* Environment variable secrets

---

## 📡 API Overview

### Auth

* POST `/api/login`
* POST `/api/logout`
* GET `/api/me`
* POST `/api/reset-password`

### Admin

* POST `/api/admin/reset-user-password`
* POST `/api/staff`
* PUT `/api/staff/:id`
* DELETE `/api/staff/:id`
* POST `/api/holidays`
* DELETE `/api/holidays`

### Attendance

* GET `/api/attendance`
* GET `/api/attendance/month`
* POST `/api/attendance`
* DELETE `/api/attendance`

### Health

* GET `/api/health`

---

## 📱 Mobile Optimized

* Responsive layout
* Installable as PWA (optional)
* Optimized for phone use

---

## ⚠ Production Notes

Current session store uses MemoryStore (development only).

Recommended upgrade:

* PostgreSQL session store (`connect-pg-simple`)
* Rate limiting on login
* Account lock after failed attempts

---

## 👤 Author

Samar Raj

GitHub:
[https://github.com/samarrajx](https://github.com/samarrajx)

---

## 📄 License

Private / Internal Use