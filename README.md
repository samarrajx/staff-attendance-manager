
# 📊 Staff Attendance Manager

A full-stack Staff Attendance Management System built with **Node.js, Express, and SQLite**.
Designed to manage employee attendance, generate monthly reports, and provide real-time analytics through a clean admin dashboard.

---

## 🌐 Live Demo

🔗 [https://staff-attendance-manager.onrender.com](https://staff-attendance-manager.onrender.com)

### 🔐 Demo Login

```
Username: admin
Password: admin123
```

---

## 🚀 Features

### 🔑 Authentication & Security

* Session-based authentication
* Secure password hashing using **bcrypt**
* Role-based access (Admin / Staff)
* Protected API routes

### 👥 Staff Management

* Add / Edit / Delete staff
* Department & position management
* Search & filter functionality

### 📅 Attendance System

* Mark: Present / Absent / Half Day
* Holiday management
* Weekend detection
* Real-time status tracking

### 📊 Dashboard Analytics

* Live attendance summary
* Pie chart visualization (Chart.js)
* Staff status overview

### 📈 Monthly Reports

* Department-wise filtering
* Excel export (XLSX)
* PDF export (jsPDF + AutoTable)
* Attendance legend system

---

## 🛠 Tech Stack

### Backend

* Node.js
* Express.js
* better-sqlite3
* express-session
* bcrypt
* uuid

### Frontend

* Vanilla JavaScript
* Chart.js
* XLSX
* jsPDF

### Deployment

* Render (Web Service)
* GitHub (Version Control)

---

## 🏗 Architecture Overview

```
staff-attendance-manager/
│
├── server.js            # Express server & API routes
├── db.js                # SQLite database layer
├── package.json
├── public/
│   ├── index.html       # Main dashboard
│   ├── login.html       # Login page
│   ├── css/style.css
│   └── js/app.js
└── .gitignore
```

* Backend handles authentication, database queries, and report generation.
* Frontend communicates via REST API.
* SQLite used for lightweight persistent storage.
* Session middleware protects private routes.

---

## ⚙️ Local Installation

Clone the repository:

```bash
git clone https://github.com/samarrajx/staff-attendance-manager.git
cd staff-attendance-manager
```

Install dependencies:

```bash
npm install
```

Run the server:

```bash
npm start
```

Visit:

```
http://localhost:3000
```

---

## 🔐 Default Admin (Local)

If running locally for the first time:

```
Username: admin
Password: Samarraj@12
```

---

## 📌 Key Engineering Decisions

* Used `better-sqlite3` for synchronous high-performance SQLite operations.
* Session-based authentication for simplicity and security.
* Modular database abstraction in `db.js`.
* Export functionality implemented without heavy frameworks.
* Clean dark UI design with responsive layout.

---

## 🚀 Future Improvements

* PostgreSQL migration for production scalability
* Redis session store
* JWT-based authentication
* Role-specific dashboards
* Audit logs & attendance history tracking
* Persistent storage setup for cloud environments

---

## 👨‍💻 Author

**Samar Raj**
Full-Stack Developer | Backend Systems | Data Automation

GitHub: [https://github.com/samarrajx](https://github.com/samarrajx)

---

# 💡 Project Purpose

This project demonstrates:

* Full-stack system design
* Authentication & authorization
* Database schema design
* Report generation
* Deployment to cloud environment
* Production-ready project structuring