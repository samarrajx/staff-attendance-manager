# Staff Attendance Manager — Setup Guide (Windows)

Everything you need to get this running is below. Takes about 2 minutes.

---

## What you need

- **Node.js** installed on your Windows PC. If you don't have it:
  1. Go to **https://nodejs.org**
  2. Click the big green **"Download Node.js"** button (the LTS version)
  3. Run the installer — just click Next on every screen and finish

That's it. No other software needed.

---

## First-time setup (do this once)

1. **Download and extract** this folder somewhere easy, like your Desktop or Documents.  
   You should see this structure inside:

   ```
   attendance-app/
   ├── server.js
   ├── db.js
   ├── package.json
   ├── public/
   │   └── index.html
   └── README.md          ← you're reading this
   ```

2. **Open Command Prompt** inside this folder:
   - Right-click inside the `attendance-app` folder
   - Click **"Open in Terminal"** (or on older Windows: open Command Prompt and `cd` to this folder)

3. **Run this command** (copy-paste it):

   ```
   npm install
   ```

   This downloads the small set of dependencies (Express, SQLite driver). Takes 10–20 seconds.  
   You'll see a new `node_modules` folder appear — that's normal, ignore it.

---

## How to start the app

Every time you want to use the attendance app, do this:

1. Open a **Command Prompt** inside the `attendance-app` folder.

2. Type and press Enter:

   ```
   npm start
   ```

3. You'll see this in the terminal:

   ```
   ─────────────────────────────────────────
     Staff Attendance Manager
     Running on: http://localhost:3000
     Database:   attendance.db  (same folder)
   ─────────────────────────────────────────
   ```

4. Open your browser and go to:

   ```
   http://localhost:3000
   ```

   The app is live. Done!

---

## How to stop the app

In the Command Prompt window where the server is running, press:

```
Ctrl + C
```

That's it. The server stops. You can close the terminal.

---

## Where is my data stored?

All your attendance and staff data is saved in a single file:

```
attendance-app/
└── attendance.db       ← SQLite database (auto-created on first run)
```

- This file is created automatically the first time you run `npm start`.
- It lives on **your computer only** — nothing goes to the internet.
- You can **back it up** by simply copying this `.db` file somewhere safe.
- If you ever delete it, the app starts fresh with an empty database.

---

## Quick reference

| What                        | How                                      |
|-----------------------------|------------------------------------------|
| Install (first time only)   | `npm install`                            |
| Start the server            | `npm start`                              |
| Open the app                | Browser → `http://localhost:3000`        |
| Stop the server             | `Ctrl + C` in the terminal               |
| Back up your data           | Copy `attendance.db` somewhere safe      |
| Reset / start fresh         | Delete `attendance.db`, then `npm start` |

---

## Something not working?

- **"npm: command not found"** → Node.js is not installed. See the install step above.
- **"Port 3000 is already in use"** → Another app is using port 3000. Close it, or open `server.js` in a text editor and change `3000` to another number like `3001`. Then use `http://localhost:3001` in your browser.
- **App shows "No connection"** → The server isn't running. Go back to the terminal and run `npm start`.
