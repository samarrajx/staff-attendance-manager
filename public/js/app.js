console.log("APP.JS LOADED");
// ═══════════════════════════════════════════════════════
// STAFF ATTENDANCE MANAGER — v2.0
// ═══════════════════════════════════════════════════════
async function loadLogo() {
    const res = await fetch('/sanjivani.png');
    const blob = await res.blob();

    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    base64: reader.result,
                    width: img.width,
                    height: img.height
                });
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(blob);
    });
}

let staffList = [];
let attCache = {};  // { "YYYY-MM-DD": { staffId: status } }
let monthCache = {}; // { "YYYY-MM": { staffId: status } }
let holidayDates = [];
let userRole = 'employee';
let pieChart = null; // Chart instance
// ───────── THEME SYSTEM ─────────
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'light') {
        document.body.classList.add('light');
        document.getElementById('themeIcon').className = 'ri-sun-line';
    } else {
        document.body.classList.remove('light');
        document.getElementById('themeIcon').className = 'ri-moon-line';
    }
}

function toggleTheme() {
    document.body.classList.add('theme-fade');

    const isLight = document.body.classList.toggle('light');

    localStorage.setItem('theme', isLight ? 'light' : 'dark');

    document.getElementById('themeIcon').className =
        isLight ? 'ri-sun-line' : 'ri-moon-line';

    setTimeout(() => {
        document.body.classList.remove('theme-fade');
    }, 250);
}



const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const formatDate = iso => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const isWeekend = (y, m, d) => new Date(y, m, d).getDay() === 0; // Sunday only
const initials = n => n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);
const avatarColor = n => {
    let h = 0;
    for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
    return ['#4f8aff', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c', '#67e8f9'][Math.abs(h) % 7];
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ─── SIDEBAR & UI ───
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('mobileOverlay').classList.toggle('show');
}

// ─── API ───
async function api(url, method = 'GET', body = null) {
    try {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        return res.json();
    } catch (e) { console.error(e); return { success: false }; }
}

async function fetchAll() {
    const [s, h] = await Promise.all([api('/api/staff'), api('/api/holidays')]);
    if (s.success) {
        staffList = s.data;
        updateAllDeptFilters();
    }
    if (h.success) holidayDates = h.data;
}

function updateAllDeptFilters() {
    const depts = [...new Set(staffList.map(s => s.dept).filter(Boolean))].sort();
    const filters = ['markDeptFilter', 'staffDeptFilter', 'reportDeptFilter', 'overviewDeptFilter'];

    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentVal = el.value;
            el.innerHTML = '<option value="All">All Departments</option>' +
                depts.map(d => `<option value="${d}">${d}</option>`).join('');

            // Restore selection if it still exists
            if ([...el.options].some(o => o.value === currentVal)) {
                el.value = currentVal;
            } else {
                el.value = 'All';
            }
        }
    });
}

// ─── CORE INIT ───
async function init() {
    const me = await api('/api/me');
    if (!me.success || !me.user) { window.location.href = '/login.html'; return; }

    // Set User Info
    document.getElementById('userName').textContent = me.user.username;
    document.getElementById('userRole').textContent = me.user.role;
    document.getElementById('userAvatar').textContent = me.user.username[0].toUpperCase();
    userRole = me.user.role;

    loadTheme();


    // IMPORTANT: Role Logic
    applyRoleUI(userRole);

    // Initial Data
    await fetchAll();

    // Default Tab
    const lastTab = localStorage.getItem('activeTab') || 'dashboard';
    switchTab(lastTab);

    // Clock
    setInterval(() => {
        const el = document.getElementById('liveClock');
        if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }, 1000);

    // Server Check
    try {
        const health = await api('/api/health');
        if (health.status === 'ok') {
            document.getElementById('serverDot').classList.remove('off');
            document.getElementById('serverLabel').textContent = 'Live';
        }
    } catch (e) {
        document.getElementById('serverDot').classList.add('off');
        document.getElementById('serverLabel').textContent = 'Offline';
    }
}

// ─── ROLE UI LOGIC ───
function applyRoleUI(role) {
    if (role === 'employee') {
        // Hide Admin/Manager tabs
        document.getElementById('nav-staff').style.display = 'none';

        // Hide Action Buttons
        const addStaffBtn = document.querySelector('button[onclick="openAddStaff()"]');
        if (addStaffBtn) addStaffBtn.style.display = 'none';

        // Employee CAN see Dashboard, Mark (Self), Holiday, Report, Overview
        // But usually employee shouldn't mark their own attendance? 
        // If requirement says employee VIEW ONLY, hide mark tab:
        document.getElementById('nav-mark').style.display = 'none';
    } else {
        // Admin/Manager see everything
    }
}

// ─── NAVIGATION ───
function switchTab(name) {
    localStorage.setItem('activeTab', name);
    // Mobile: Close sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('mobileOverlay').classList.remove('show');

    // Navbar Active State
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.getElementById('nav-' + name);
    if (nav) nav.classList.add('active');

    // Page Visibility
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');

    // Page Title Update
    const titles = {
        'dashboard': 'Dashboard',
        'mark': 'Mark Attendance',
        'staff': 'Staff Management',
        'holiday': 'Holidays',
        'report': 'Monthly Report',
        'overview': 'Overview'
    };
    document.getElementById('pageTitle').textContent = titles[name];

    // Load Data
    if (name === 'dashboard') renderDashboard();
    if (name === 'mark') renderMarkPage();
    if (name === 'staff') renderStaffTable();
    if (name === 'holiday') renderHolidays();
    if (name === 'report') populateReportSelectors();
    if (name === 'overview') populateOverviewSelectors();
}

// ─── DASHBOARD ───
async function renderDashboard() {
    const date = today();
    const attRes = await api('/api/attendance?date=' + date);
    const att = attRes.data || {};

    let counts = { present: 0, absent: 0, halfday: 0, unmarked: 0 };

    staffList.forEach(s => {
        const st = att[s.id];
        if (st) counts[st] = (counts[st] || 0) + 1;
        else counts.unmarked++;
    });

    ['present', 'absent', 'halfday', 'unmarked'].forEach(k => {
        document.getElementById('stat-' + k).textContent = counts[k];
    });

    // Chart
    const ctx = document.getElementById('pieChart').getContext('2d');
    if (pieChart) pieChart.destroy();

    document.getElementById('totalStaffCount').textContent = staffList.length;

    pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Absent', 'Half Day', 'Unmarked'],
            datasets: [{
                data: [counts.present, counts.absent, counts.halfday, counts.unmarked],
                backgroundColor: ['#34d399', '#f87171', '#fbbf24', '#252a36'],
                borderWidth: 0, hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });

    // List
    const list = document.getElementById('dashStaffList');
    if (!staffList.length) list.innerHTML = '<div style="color:#777;text-align:center;">No staff found</div>';
    else {
        list.innerHTML = staffList.map(s => {
            const st = att[s.id] || 'unmarked';
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--card-border)">
        <div class="user-avatar" style="background:${avatarColor(s.name)};color:#fff;width:32px;height:32px;font-size:12px">${initials(s.name)}</div>
        <div style="flex:1"><div style="font-size:14px;font-weight:600">${s.name}</div><div style="font-size:11px;color:var(--text-muted)">${s.dept || '—'}</div></div>
        <span class="status-badge" style="font-size:10px;padding:4px 8px;text-transform:capitalize;color:${st == 'present' ? 'var(--green)' : st == 'absent' ? 'var(--red)' : st == 'halfday' ? 'var(--amber)' : 'var(--text-muted)'}">${st}</span>
      </div>`;
        }).join('');
    }
}

// ─── MARK ATTENDANCE ───
async function renderMarkPage() {
    const date = document.getElementById('markDate').value || today();
    document.getElementById('markDate').value = date;
    const dept = document.getElementById('markDeptFilter').value;

    // Populate depts
    const depts = [...new Set(staffList.map(s => s.dept).filter(Boolean))];
    const filters = ['markDeptFilter', 'staffDeptFilter', 'reportDeptFilter', 'overviewDeptFilter'];

    // Only update if empty to preserve selection
    if (document.getElementById('markDeptFilter').children.length === 1) {
        filters.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="All">All Departments</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
        });
    }

    const attRes = await api('/api/attendance?date=' + date);
    const att = attRes.data || {};
    attCache[date] = att;

    const filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);
    const grid = document.getElementById('attGrid');

    if (!filtered.length) {
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No staff found</div>';
        return;
    }

    grid.innerHTML = filtered.map(s => {
        const st = att[s.id] || '';
        return `<div class="att-card">
      <div class="att-info">
        <div class="user-avatar" style="background:${avatarColor(s.name)};width:38px;height:38px">${initials(s.name)}</div>
        <div><div style="font-weight:600">${s.name}</div><div style="font-size:12px;color:var(--text-muted)">${s.dept || '—'}</div></div>
      </div>
      <div class="att-actions">
        ${['present', 'absent', 'halfday', 'holiday', 'weekend'].map(type =>
            `<button class="status-btn ${st === type ? 'active-' + type : ''}" onclick="setAtt('${date}','${s.id}','${type}')">${type.charAt(0).toUpperCase() + type.slice(1)}</button>`
        ).join('')}
      </div>
    </div>`;
    }).join('');
}

async function setAtt(date, id, status) {
    const current = (attCache[date] || {})[id];
    if (current === status) {
        await api('/api/attendance', 'DELETE', { staffId: id, date });
        if (attCache[date]) delete attCache[date][id];
    } else {
        await api('/api/attendance', 'POST', { staffId: id, date, status });
        if (!attCache[date]) attCache[date] = {};
        attCache[date][id] = status;
    }
    renderMarkPage();
}

async function markAllPresent() {
    const date = document.getElementById('markDate').value;
    const dept = document.getElementById('markDeptFilter').value;
    const filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);

    if (confirm(`Mark ${filtered.length} staff as Present for ${date}?`)) {
        for (const s of filtered) {
            await api('/api/attendance', 'POST', { staffId: s.id, date, status: 'present' });
        }
        showToast('Marked all present');
        renderMarkPage();
    }
}

// ─── STAFF MANAGEMENT ───
async function renderStaffTable() {
    await fetchAll(); // Refresh
    const search = document.getElementById('staffSearch').value.toLowerCase();
    const dept = document.getElementById('staffDeptFilter').value;

    const filtered = staffList.filter(s => {
        if (dept !== 'All' && s.dept !== dept) return false;
        return s.name.toLowerCase().includes(search) || s.id.toLowerCase().includes(search);
    });

    document.getElementById('staffTableBody').innerHTML = filtered.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:11px;background:${avatarColor(s.name)}">${initials(s.name)}</div>
          <strong>${s.name}</strong>
        </div>
      </td>
      <td>${s.id}</td>
      <td>${s.dept || '—'}</td>
      <td>${s.position || '—'}</td>
      <td style="text-align:right">
        <button class="btn btn-outline" style="padding:4px 8px;font-size:11px" onclick="editStaff('${s.id}')">Edit</button>
        <button class="btn btn-outline" style="padding:4px 8px;font-size:11px" onclick="resetUserPassword('${s.id}')">Reset</button>
        <button class="btn btn-danger" style="padding:4px 8px;font-size:11px" onclick="deleteStaff('${s.id}')">Del</button>
      </td>
    </tr>
  `).join('');
}

function openAddStaff() {
    document.getElementById('staffModalTitle').textContent = 'Add Staff';
    document.getElementById('editStaffId').value = '';
    ['staffName', 'staffId', 'staffDept', 'staffPosition'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('staffModal').classList.add('show');
}
function closeStaffModal() { document.getElementById('staffModal').classList.remove('show'); }

async function saveStaff() {
    const id = document.getElementById('staffId').value;
    const name = document.getElementById('staffName').value;
    const dept = document.getElementById('staffDept').value;
    const pos = document.getElementById('staffPosition').value;
    const role = document.getElementById('staffRole').value;
    const editId = document.getElementById('editStaffId').value;

    if (!id || !name) { showToast('Name and ID required'); return; }

    if (editId) {
        const res = await api('/api/staff/' + editId, 'PUT', { id, name, dept, position: pos, role });
        if (res.success) {
            showToast('Staff Updated');
        } else {
            showToast(res.error || 'Update failed');
            return;
        }
    } else {
        // NEW: Passing role here
        const res = await api('/api/staff', 'POST', { id, name, dept, position: pos, role });
        if (res.success) {
            showToast('Staff Added');
        } else {
            showToast('ID already exists or error');
            return;
        }
    }
    closeStaffModal();
    renderStaffTable();
}

function editStaff(id) {
    const s = staffList.find(x => x.id === id);
    if (!s) return;
    document.getElementById('staffModalTitle').textContent = 'Edit Staff';
    document.getElementById('editStaffId').value = id;
    document.getElementById('staffName').value = s.name;
    document.getElementById('staffId').value = s.id;
    document.getElementById('staffDept').value = s.dept || '';
    document.getElementById('staffPosition').value = s.position || '';

    // NEW: Setting Role
    document.getElementById('staffRole').value = s.role || 'employee';

    document.getElementById('staffModal').classList.add('show');
}

async function deleteStaff(id) {
    if (confirm('Delete staff? This will remove all their attendance records.')) {
        await api('/api/staff/' + id, 'DELETE');
        renderStaffTable();
    }
}

// ─── REPORT & OVERVIEW ───
function populateReportSelectors() {
    const d = new Date();
    const mSel = document.getElementById('reportMonth');
    if (mSel.children.length === 0) {
        mSel.innerHTML = MONTHS.map((m, i) => `<option value="${i}" ${i == d.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
        let yHtml = '';
        for (let y = d.getFullYear() - 1; y <= d.getFullYear() + 1; y++) yHtml += `<option value="${y}" ${y == d.getFullYear() ? 'selected' : ''}>${y}</option>`;
        document.getElementById('reportYear').innerHTML = yHtml;
    }
    renderReport();
}

function populateOverviewSelectors() {
    const d = new Date();
    const mSel = document.getElementById('overviewMonth');
    if (mSel.children.length === 0) {
        mSel.innerHTML = MONTHS.map((m, i) => `<option value="${i}" ${i == d.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
        let yHtml = '';
        for (let y = d.getFullYear() - 1; y <= d.getFullYear() + 1; y++) yHtml += `<option value="${y}" ${y == d.getFullYear() ? 'selected' : ''}>${y}</option>`;
        document.getElementById('overviewYear').innerHTML = yHtml;
    }
    renderMonthlyOverview();
}

async function renderReport() {
    const m = parseInt(document.getElementById('reportMonth').value);
    const y = parseInt(document.getElementById('reportYear').value);
    const dept = document.getElementById('reportDeptFilter').value;
    const days = getDaysInMonth(y, m);

    const res = await api(`/api/attendance/month?year=${y}&month=${m}`);
    const data = res.data || {};

    const filtered = dept === 'All'
        ? staffList
        : staffList.filter(s => s.dept === dept);

    // Update Title
    document.getElementById('reportTitle').textContent = `Attendance Log: ${MONTHS[m]} ${y}`;
    document.getElementById('reportSubtitle').textContent = dept === 'All' ? 'All Departments' : `Department: ${dept}`;

    // ───────── DETERMINE LAST DAY TO COUNT (TILL DATE LOGIC) ─────────
    const today = new Date();
    let lastDayToCount = days;

    if (y === today.getFullYear() && m === today.getMonth()) {
        lastDayToCount = today.getDate();
    }

    // ───────── CALCULATE WORKING DAYS (ONCE) ─────────
    let workingDays = 0;

    for (let d = 1; d <= lastDayToCount; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const isHoliday = holidayDates.some(h => h.date === dateStr);
        const isSun = isWeekend(y, m, d);

        if (!isHoliday && !isSun) {
            workingDays++;
        }
    }

    // ───────── CALCULATE TOTALS ─────────
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalHalf = 0;

    filtered.forEach(s => {
        for (let d = 1; d <= lastDayToCount; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const st = (data[dateStr] || {})[s.id];

            if (st === 'present') totalPresent++;
            if (st === 'absent') totalAbsent++;
            if (st === 'halfday') totalHalf++;
        }
    });

    const totalExpectedEntries = workingDays * filtered.length;

    const attendancePercent = totalExpectedEntries
        ? Math.round(((totalPresent + (totalHalf * 0.5)) / totalExpectedEntries) * 100)
        : 0;

    // ───────── RENDER STAT CARDS ─────────
    document.getElementById('reportStats').innerHTML = `
        <div class="stat-card shadow-green" style="--accent-color:var(--green)">
            <div class="stat-header">
                <span class="stat-label">Total Present</span>
                <i class="ri-user-check-line" style="color:var(--green)"></i>
            </div>
            <div class="stat-value">${totalPresent}</div>
        </div>

        <div class="stat-card shadow-red" style="--accent-color:var(--red)">
            <div class="stat-header">
                <span class="stat-label">Total Absent</span>
                <i class="ri-user-unfollow-line" style="color:var(--red)"></i>
            </div>
            <div class="stat-value">${totalAbsent}</div>
        </div>

        <div class="stat-card shadow-amber" style="--accent-color:var(--amber)">
            <div class="stat-header">
                <span class="stat-label">Total Half Day</span>
                <i class="ri-time-line" style="color:var(--amber)"></i>
            </div>
            <div class="stat-value">${totalHalf}</div>
        </div>

        <div class="stat-card shadow-accent" style="--accent-color:var(--text-muted)">
            <div class="stat-header">
                <span class="stat-label">Working Days</span>
                <i class="ri-calendar-check-line" style="color:var(--text-muted)"></i>
            </div>
            <div class="stat-value">${workingDays}</div>
        </div>

        <div class="stat-card shadow-accent" style="--accent-color:var(--accent)">
            <div class="stat-header">
                <span class="stat-label">Attendance %</span>
                <i class="ri-percent-line" style="color:var(--accent)"></i>
            </div>
            <div class="stat-value">${attendancePercent}%</div>
        </div>
    `;

    // Update Report Table Title Placeholder if needed (adding it now to HTML)

    // ───────── BUILD TABLE HEADER ─────────
    let head = '<tr><th style="position:sticky;left:0;z-index:10;background:var(--card);min-width:150px">Staff</th>';

    for (let d = 1; d <= days; d++) {
        const wd = new Date(y, m, d).getDay();
        const color = (wd === 0 || wd === 6)
            ? 'var(--red)'
            : 'var(--text-muted)';

        head += `
            <th style="text-align:center;min-width:34px;color:${color}">
                ${d}
                <br>
                <span style="font-size:9px">
                    ${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][wd]}
                </span>
            </th>`;
    }

    head += '</tr>';
    document.getElementById('reportThead').innerHTML = head;

    // ───────── BUILD TABLE BODY ─────────
    document.getElementById('reportTbody').innerHTML =
        filtered.map(s => {

            let row = `
                <tr>
                    <td style="position:sticky;left:0;z-index:9;background:var(--card);font-weight:600">
                        ${s.name}
                    </td>
            `;

            for (let d = 1; d <= days; d++) {
                const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                let st = (data[dateStr] || {})[s.id];

                if (!st) {
                    if (holidayDates.some(h => h.date === dateStr)) st = 'holiday';
                    else if (isWeekend(y, m, d)) st = 'weekend';
                }

                let badge = '';

                if (st === 'present')
                    badge = '<span style="color:var(--green);font-weight:bold">P</span>';
                else if (st === 'absent')
                    badge = '<span style="color:var(--red);font-weight:bold">A</span>';
                else if (st === 'halfday')
                    badge = '<span style="color:var(--amber);font-weight:bold">H</span>';
                else if (st === 'holiday')
                    badge = '<span style="color:var(--purple)">●</span>';
                else if (st === 'weekend')
                    badge = '<span style="color:var(--text-muted);opacity:0.3">W</span>';

                row += `
                    <td style="
                        text-align:center;
                        background:${st === 'present'
                        ? 'rgba(52,211,153,0.05)'
                        : st === 'absent'
                            ? 'rgba(248,113,113,0.05)'
                            : ''
                    };
                        border-right:1px solid #222">
                        ${badge}
                    </td>
                `;
            }

            return row + '</tr>';
        }).join('');
}



async function renderMonthlyOverview() {
    const m = parseInt(document.getElementById('overviewMonth').value);
    const y = parseInt(document.getElementById('overviewYear').value);
    const dept = document.getElementById('overviewDeptFilter').value;

    const res = await api(`/api/attendance/month?year=${y}&month=${m}`);
    const data = res.data || {};
    const dates = Object.keys(data); // "YYYY-MM-DD"

    const filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);

    // Update Title
    document.getElementById('overviewTitle').textContent = `Overview: ${MONTHS[m]} ${y}`;
    document.getElementById('overviewSubtitle').textContent = dept === 'All' ? 'All Departments' : `Department: ${dept}`;

    document.getElementById('overviewTableBody').innerHTML = filtered.map((s, i) => {
        let p = 0, a = 0, h = 0;

        dates.forEach(d => {
            if (data[d][s.id] === 'present') p++;
            if (data[d][s.id] === 'absent') a++;
            if (data[d][s.id] === 'halfday') h++;
        });

        const todayDate = new Date();
        const selectedMonth = m;
        const selectedYear = y;

        let lastDayToCount;

        // If selected month is current month → count till today
        if (
            selectedYear === todayDate.getFullYear() &&
            selectedMonth === todayDate.getMonth()
        ) {
            lastDayToCount = todayDate.getDate();
        }
        // If selected month is future → no attendance yet
        else if (
            selectedYear > todayDate.getFullYear() ||
            (selectedYear === todayDate.getFullYear() &&
                selectedMonth > todayDate.getMonth())
        ) {
            lastDayToCount = 0;
        }
        // Past month → full month
        else {
            lastDayToCount = getDaysInMonth(selectedYear, selectedMonth);
        }

        let workingDays = 0;

        for (let d = 1; d <= lastDayToCount; d++) {
            const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            const isHoliday = holidayDates.some(h => h.date === dateStr);
            const isSun = isWeekend(selectedYear, selectedMonth, d);

            if (!isHoliday && !isSun) {
                workingDays++;
            }
        }

        const pct = workingDays
            ? Math.round(((p + (h * 0.5)) / workingDays) * 100)
            : 0;


        return `<tr>
      <td>${i + 1}</td>
      <td><strong>${s.name}</strong></td>
      <td>${s.id}</td>
      <td style="color:var(--green)">${p}</td>
      <td style="color:var(--red)">${a}</td>
      <td style="color:var(--amber)">${h}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;background:#333;border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct > 75 ? 'var(--green)' : pct > 50 ? 'var(--amber)' : 'var(--red)'}"></div>
          </div>
          <span style="font-size:12px">${pct}%</span>
        </div>
      </td>
    </tr>`;
    }).join('');
    // ───────── STACKED BAR CHART ─────────

    const ctx = document.getElementById('overviewStackedChart').getContext('2d');

    if (window.overviewChart) {
        window.overviewChart.destroy();
    }

    const names = [];
    const presentData = [];
    const halfData = [];
    const absentData = [];

    filtered.forEach(s => {
        let p = 0, a = 0, h = 0;

        for (let d = 1; d <= getDaysInMonth(y, m); d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const st = (data[dateStr] || {})[s.id];

            if (st === 'present') p++;
            if (st === 'absent') a++;
            if (st === 'halfday') h++;
        }

        names.push(s.name);
        presentData.push(p);
        halfData.push(h);
        absentData.push(a);
    });

    window.overviewChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: names,
            datasets: [
                {
                    label: 'Present',
                    data: presentData,
                    backgroundColor: '#34d399'
                },
                {
                    label: 'Half Day',
                    data: halfData,
                    backgroundColor: '#fbbf24'
                },
                {
                    label: 'Absent',
                    data: absentData,
                    backgroundColor: '#f87171'
                }
            ]
        },
        options: {
            indexAxis: 'y', // 🔥 horizontal
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: { color: '#222' },
                    ticks: { color: '#aaa' }
                },
                y: {
                    stacked: true,
                    ticks: { color: '#ccc' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#fff' }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 10 },
                    formatter: (value) => value > 0 ? value : ''
                }
            }
        },
        plugins: [ChartDataLabels]
    });

}

// ─── AUTH ───
async function openPasswordModal() { document.getElementById('passwordModal').classList.add('show'); }
async function closePasswordModal() { document.getElementById('passwordModal').classList.remove('show'); }
async function resetPassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    const res = await api('/api/reset-password', 'POST', { currentPassword, newPassword });
    if (res.success) { showToast('Password changed'); closePasswordModal(); }
    else showToast(res.error || 'Failed to change password');
}

async function resetUserPassword(staffId) {
    if (!confirm('Reset password to default (ChangeMe123)?')) return;

    const res = await api('/api/admin/reset-user-password', 'POST', { staffId });

    if (res.success) showToast('Password reset successfully');
    else showToast('Reset failed');
}

async function logout() {
    await api('/api/logout', 'POST');
    window.location.href = '/login.html';
}

// ─── HOLIDAYS ───
async function renderHolidays() {
    const el = document.getElementById('holidayList');
    if (!holidayDates.length) el.innerHTML = '<div style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:40px">No holidays added</div>';
    else {
        el.innerHTML = holidayDates.map(h => `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:16px;">
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--purple)">${h.name}</div>
          <div style="font-size:12px;color:var(--text-muted)">${formatDate(h.date)}</div>
        </div>
        <button class="btn btn-danger" style="padding:6px 12px;font-size:11px" onclick="deleteHoliday('${h.date}')">Delete</button>
      </div>
    `).join('');
    }
}
async function addHoliday() {
    const date = document.getElementById('holidayDate').value;
    const name = document.getElementById('holidayName').value;
    if (date && name) {
        const res = await api('/api/holidays', 'POST', { date, name });
        if (res.success) {
            await fetchAll();
            renderHolidays();
            showToast('Holiday added');
            document.getElementById('holidayDate').value = '';
            document.getElementById('holidayName').value = '';
        } else {
            showToast('Failed to add holiday: ' + (res.error || 'Access Denied'));
        }
    } else {
        showToast('Date and Name are required');
    }
}
async function deleteHoliday(date) {
    if (confirm('Delete holiday?')) {
        const res = await api('/api/holidays', 'DELETE', { date });
        if (res.success) {
            await fetchAll();
            renderHolidays();
            showToast('Holiday deleted');
        } else {
            showToast('Failed to delete: ' + (res.error || 'Access Denied'));
        }
    }
}

// ─── EXPORT ───
async function downloadExcel() {
    const m = parseInt(document.getElementById('reportMonth').value);
    const y = parseInt(document.getElementById('reportYear').value);
    const dept = document.getElementById('reportDeptFilter').value;

    const days = getDaysInMonth(y, m);

    const res = await api(`/api/attendance/month?year=${y}&month=${m}`);
    const data = res.data || {};
    const filtered = dept === 'All'
        ? staffList
        : staffList.filter(s => s.dept === dept);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Monthly Report');
    sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 8 }]; // Freeze first 3 columns and header

    const totalColumns = 3 + days + 3; // #, Name, ID + days + P A H
    const lastColumnLetter = sheet.getColumn(totalColumns).letter;

    // ───────── LETTERHEAD ─────────
    sheet.mergeCells(`A1:${lastColumnLetter}1`);
    sheet.getCell('A1').value = 'SANJIVANI VIKAS FOUNDATION';
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF008000' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells(`A2:${lastColumnLetter}2`);
    sheet.getCell('A2').value =
        'Behind P.N.B., Mahatma Gandhi Nagar, Kankarbagh, Patna-800026 (Bihar)';
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    sheet.mergeCells(`A3:${lastColumnLetter}3`);
    sheet.getCell('A3').value =
        'Regd. Under Societies Regn. Act, 21 of 1860 | Regn. No. 497/2004-05';
    sheet.getCell('A3').alignment = { horizontal: 'center' };

    sheet.mergeCells(`A4:${lastColumnLetter}4`);
    sheet.getCell('A4').value =
        'Ph: 0612-2360350 | sanjivanivf@gmail.com | www.sanjivanivf.org';
    sheet.getCell('A4').alignment = { horizontal: 'center' };

    // ───────── TITLE & LEGEND ─────────
    sheet.mergeCells(`A6:${lastColumnLetter}6`);
    sheet.getCell('A6').value =
        `MONTHLY ATTENDANCE REPORT - ${MONTHS[m]} ${y}`;
    sheet.getCell('A6').font = { size: 13, bold: true };
    sheet.getCell('A6').alignment = { horizontal: 'center' };

    // Row 7: Legend
    sheet.getCell('A7').value = 'Legend: P:Present (Green), A:Absent (Red), H:Half-Day (Yellow), S:Sunday, Hol:Holiday';
    sheet.mergeCells(`A7:${lastColumnLetter}7`);
    sheet.getCell('A7').font = { italic: true, size: 10 };
    sheet.getCell('A7').alignment = { horizontal: 'center' };

    // ───────── HEADER ROW ─────────
    const headerRowIndex = 8;
    const headers = ['#', 'Employee Name', 'ID'];

    for (let d = 1; d <= days; d++) {
        headers.push(d);
    }
    headers.push('P', 'A', 'H');

    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = headers;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF008000' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;

    // ───────── DATA ROWS ─────────
    let currentDataRow = 9;
    filtered.forEach((s, i) => {
        let p = 0, a = 0, h = 0;
        const rowData = [i + 1, s.name, s.id];

        for (let d = 1; d <= days; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let st = (data[dateStr] || {})[s.id];

            if (!st) {
                if (holidayDates.some(h => h.date === dateStr)) st = 'holiday';
                else if (isWeekend(y, m, d)) st = 'weekend';
            }

            if (st === 'present') { rowData.push('P'); p++; }
            else if (st === 'absent') { rowData.push('A'); a++; }
            else if (st === 'halfday') { rowData.push('H'); h++; }
            else if (st === 'holiday') { rowData.push('Hol'); }
            else if (st === 'weekend') { rowData.push('S'); }
            else { rowData.push(''); }
        }

        rowData.push(p, a, h);

        const addedRow = sheet.getRow(currentDataRow++);
        addedRow.values = rowData;
        addedRow.alignment = { vertical: 'middle' }; // Default alignment

        // Coloring cells
        addedRow.eachCell((cell, colNumber) => {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (colNumber === 2) cell.alignment.horizontal = 'left'; // Name left-aligned

            if (colNumber > 3 && colNumber <= 3 + days) {
                const val = cell.value;
                if (val === 'P') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                if (val === 'A') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
                if (val === 'H') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
                if (val === 'S' || val === 'Hol') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E2E2' } };
            }
            // Style summary columns
            if (colNumber > 3 + days) {
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
            }
        });
    });

    // ───────── COLUMN WIDTHS ─────────
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 25;
    sheet.getColumn(3).width = 15;

    for (let c = 4; c <= 3 + days; c++) {
        sheet.getColumn(c).width = 4;
    }

    sheet.getColumn(4 + days).width = 8;
    sheet.getColumn(5 + days).width = 8;
    sheet.getColumn(6 + days).width = 8;

    // ───────── BORDERS ─────────
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber >= headerRowIndex) {
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SANJIVANI_Report_${MONTHS[m]}_${y}.xlsx`;
    a.click();
}


async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    const logo = await loadLogo();

    const desiredWidth = 70;
    const proportionalHeight = (logo.height / logo.width) * desiredWidth;

    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = (pageWidth - desiredWidth) / 2;

    doc.addImage(
        logo.base64,
        'PNG',
        centerX,
        8,
        desiredWidth,
        proportionalHeight
    );

    const logoBottom = 8 + proportionalHeight;

    doc.setFontSize(18);
    doc.setTextColor(0, 128, 0);
    doc.text("SANJIVANI VIKAS FOUNDATION", pageWidth / 2, logoBottom + 12, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Behind P.N.B., Mahatma Gandhi Nagar, Kankarbagh, Patna-800026 (Bihar)", pageWidth / 2, logoBottom + 18, { align: "center" });
    doc.text("Regd. Under Societies Regn. Act, 21 of 1860 | Regn. No. 497/2004-05", pageWidth / 2, logoBottom + 23, { align: "center" });
    doc.text("Ph: 0612-2360350 | sanjivanivf@gmail.com | www.sanjivanivf.org", pageWidth / 2, logoBottom + 28, { align: "center" });

    doc.setDrawColor(255, 128, 0);
    doc.line(14, logoBottom + 33, pageWidth - 14, logoBottom + 33);

    const m = parseInt(document.getElementById('reportMonth').value);
    const y = parseInt(document.getElementById('reportYear').value);
    const dept = document.getElementById('reportDeptFilter').value;
    const days = getDaysInMonth(y, m);

    const res = await api(`/api/attendance/month?year=${y}&month=${m}`);
    const data = res.data || {};
    const filtered = dept === 'All'
        ? staffList
        : staffList.filter(s => s.dept === dept);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("MONTHLY ATTENDANCE REPORT", pageWidth / 2, logoBottom + 45, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`${MONTHS[m]} ${y} | ${dept === 'All' ? 'All Departments' : dept}`, pageWidth / 2, logoBottom + 52, { align: "center" });

    // Legend line
    doc.setFontSize(8);
    doc.text("Legend: P:Present, A:Absent, H:Half-Day, S:Sunday, Hol:Holiday", 14, logoBottom + 58);

    const head = [['#', 'Employee Name', 'ID', ...Array.from({ length: days }, (_, i) => i + 1), 'P', 'A', 'H']];

    const body = filtered.map((s, i) => {
        let p = 0, a = 0, h = 0;
        const row = [i + 1, s.name, s.id];

        for (let d = 1; d <= days; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let st = (data[dateStr] || {})[s.id];

            if (!st) {
                if (holidayDates.some(h => h.date === dateStr)) st = 'holiday';
                else if (isWeekend(y, m, d)) st = 'weekend';
            }

            if (st === 'present') { row.push('P'); p++; }
            else if (st === 'absent') { row.push('A'); a++; }
            else if (st === 'halfday') { row.push('H'); h++; }
            else if (st === 'holiday') { row.push('Hol'); }
            else if (st === 'weekend') { row.push('S'); }
            else row.push('');
        }

        row.push(p, a, h);
        return row;
    });

    doc.autoTable({
        head,
        body,
        startY: logoBottom + 62,
        styles: { fontSize: 6, cellPadding: 1, lineWidth: 0.1, lineColor: [200, 200, 200] },
        headStyles: {
            fillColor: [0, 128, 0],
            textColor: 255,
            halign: 'center',
            valign: 'middle'
        },
        columnStyles: {
            0: { cellWidth: 6, halign: 'center' },
            1: { cellWidth: 35 },
            2: { cellWidth: 15, halign: 'center' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index > 2) {
                data.cell.styles.halign = 'center';
                const val = data.cell.text[0];
                if (val === 'P') data.cell.styles.fillColor = [200, 240, 200];
                if (val === 'A') data.cell.styles.fillColor = [240, 200, 200];
                if (val === 'H') data.cell.styles.fillColor = [255, 230, 200];
                if (val === 'S' || val === 'Hol') data.cell.styles.fillColor = [235, 235, 235];

                // Bold the summary columns
                if (data.column.index >= data.row.cells.length - 3) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [245, 245, 245];
                }
            }
        },
        didDrawPage: function (data) {
            const pageCount = doc.internal.getNumberOfPages();
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(
                `Page ${pageCount} | Generated on ${new Date().toLocaleString()} | SANJIVANI VIKAS FOUNDATION`,
                pageWidth / 2,
                pageHeight - 8,
                { align: "center" }
            );
        }
    });

    doc.save(`SANJIVANI_Report_${MONTHS[m]}_${y}.pdf`);
}



async function downloadOverviewExcel() {
    const m = parseInt(document.getElementById('overviewMonth').value);
    const y = parseInt(document.getElementById('overviewYear').value);
    const dept = document.getElementById('overviewDeptFilter').value;

    const res = await api(`/api/attendance/month?year=${y}&month=${m}`);
    const data = res.data || {};
    const filtered = dept === 'All'
        ? staffList
        : staffList.filter(s => s.dept === dept);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Overview');
    sheet.views = [{ state: 'frozen', ySplit: 8 }]; // Freeze header row

    const totalDays = getDaysInMonth(y, m);

    // ───────── LETTERHEAD ─────────
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = 'SANJIVANI VIKAS FOUNDATION';
    sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF008000' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value =
        'Behind P.N.B., Mahatma Gandhi Nagar, Kankarbagh, Patna-800026 (Bihar)';
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    sheet.mergeCells('A3:G3');
    sheet.getCell('A3').value =
        'Regd. Under Societies Regn. Act, 21 of 1860 | Regn. No. 497/2004-05';
    sheet.getCell('A3').alignment = { horizontal: 'center' };

    sheet.mergeCells('A4:G4');
    sheet.getCell('A4').value =
        'Ph: 0612-2360350 | sanjivanivf@gmail.com | www.sanjivanivf.org';
    sheet.getCell('A4').alignment = { horizontal: 'center' };

    // ───────── TITLE ─────────
    sheet.mergeCells('A6:G6');
    sheet.getCell('A6').value =
        `MONTHLY ATTENDANCE OVERVIEW - ${MONTHS[m]} ${y}`;
    sheet.getCell('A6').font = { size: 13, bold: true };
    sheet.getCell('A6').alignment = { horizontal: 'center' };

    // ───────── TABLE HEADER ─────────
    const headerRowIndex = 8;
    const headers = ['#', 'Employee Name', 'Staff ID', 'Present', 'Absent', 'Half Day', 'Attendance %'];

    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.values = headers;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF008000' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;

    // ───────── CALC WORKING DAYS ─────────
    const today = new Date();
    let lastDayToCount;
    if (y === today.getFullYear() && m === today.getMonth()) {
        lastDayToCount = today.getDate();
    } else if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth())) {
        lastDayToCount = 0;
    } else {
        lastDayToCount = totalDays;
    }

    let workingDays = 0;
    for (let d = 1; d <= lastDayToCount; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!isWeekend(y, m, d) && !holidayDates.some(h => h.date === dateStr)) {
            workingDays++;
        }
    }

    // ───────── DATA ─────────
    let grandPresent = 0, grandAbsent = 0, grandHalf = 0;
    let currentDataRow = 9;

    filtered.forEach((s, i) => {
        let p = 0, a = 0, h = 0;

        // Note: For overview, we count all attendance in the month
        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const st = (data[dateStr] || {})[s.id];

            if (st === 'present') p++;
            if (st === 'absent') a++;
            if (st === 'halfday') h++;
        }

        grandPresent += p;
        grandAbsent += a;
        grandHalf += h;

        const score = p + (h * 0.5);
        const pctNum = workingDays > 0 ? (score / workingDays) * 100 : 0;
        const pctStr = pctNum.toFixed(1) + '%';

        const rowValues = [i + 1, s.name, s.id, p, a, h, pctStr];
        const addedRow = sheet.getRow(currentDataRow++);
        addedRow.values = rowValues;

        addedRow.eachCell((cell, colNumber) => {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (colNumber === 2) cell.alignment.horizontal = 'left';

            // Color the percentage cell
            if (colNumber === 7) {
                cell.font = { bold: true };
                if (pctNum >= 75) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                else if (pctNum >= 50) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } };
                else if (workingDays > 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
            }
        });
    });

    // ───────── COLUMN WIDTHS ─────────
    sheet.columns = [
        { width: 8 },
        { width: 30 },
        { width: 20 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 18 }
    ];

    // ───────── SUMMARY ─────────
    const summaryStart = currentDataRow + 1;

    sheet.getCell(`A${summaryStart}`).value = 'OVERALL SUMMARY';
    sheet.getCell(`A${summaryStart}`).font = { bold: true, size: 12, underline: true };
    sheet.mergeCells(`A${summaryStart}:C${summaryStart}`);

    const s1 = sheet.getRow(summaryStart + 1);
    s1.getCell(1).value = 'Total Present:';
    s1.getCell(2).value = grandPresent;
    s1.getCell(1).font = { bold: true };

    const s2 = sheet.getRow(summaryStart + 2);
    s2.getCell(1).value = 'Total Absent:';
    s2.getCell(2).value = grandAbsent;
    s2.getCell(1).font = { bold: true };

    const s3 = sheet.getRow(summaryStart + 3);
    s3.getCell(1).value = 'Total Half Day:';
    s3.getCell(2).value = grandHalf;
    s3.getCell(1).font = { bold: true };

    // ───────── BORDERS ─────────
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber >= headerRowIndex && rowNumber < summaryStart - 1) {
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SANJIVANI_Overview_${MONTHS[m]}_${y}.xlsx`;
    a.click();
}


async function downloadOverviewPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const logo = await loadLogo();

    // ✔ Control ONLY width
    const desiredWidth = 70;
    const proportionalHeight = (logo.height / logo.width) * desiredWidth;

    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = (pageWidth - desiredWidth) / 2;

    doc.addImage(
        logo.base64,
        'PNG',
        centerX,
        8,
        desiredWidth,
        proportionalHeight
    );

    const logoBottom = 8 + proportionalHeight;

    // ───────── LETTERHEAD TEXT ─────────
    doc.setFontSize(16);
    doc.setTextColor(0, 128, 0);
    doc.text("SANJIVANI VIKAS FOUNDATION", 105, logoBottom + 10, { align: "center" });

    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Behind P.N.B., Mahatma Gandhi Nagar, Kankarbagh, Patna-800026 (Bihar)", 105, logoBottom + 16, { align: "center" });
    doc.text("Regd. Under Societies Regn. Act, 21 of 1860 | Regn. No. 497/2004-05", 105, logoBottom + 21, { align: "center" });
    doc.text("Ph: 0612-2360350 | sanjivanivf@gmail.com | www.sanjivanivf.org", 105, logoBottom + 26, { align: "center" });

    doc.setDrawColor(255, 128, 0);
    doc.setLineWidth(0.8);
    doc.line(14, logoBottom + 31, 196, logoBottom + 31);

    // ───────── DATA SECTION ─────────
    const m = parseInt(document.getElementById('overviewMonth').value);
    const y = parseInt(document.getElementById('overviewYear').value);
    const dept = document.getElementById('overviewDeptFilter').value;

    const res = await api(`/api/attendance/month?year=${y}&month=${m}`);
    const data = res.data || {};
    const filtered = dept === 'All'
        ? staffList
        : staffList.filter(s => s.dept === dept);

    const totalDays = getDaysInMonth(y, m);

    // ───────── CALC WORKING DAYS ─────────
    const today = new Date();
    let lastDayToCount;
    if (y === today.getFullYear() && m === today.getMonth()) {
        lastDayToCount = today.getDate();
    } else if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth())) {
        lastDayToCount = 0;
    } else {
        lastDayToCount = totalDays;
    }

    let workingDays = 0;
    for (let d = 1; d <= lastDayToCount; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!isWeekend(y, m, d) && !holidayDates.some(h => h.date === dateStr)) {
            workingDays++;
        }
    }

    let grandPresent = 0, grandAbsent = 0, grandHalf = 0;

    const body = filtered.map((s, i) => {
        let p = 0, a = 0, h = 0;

        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const st = (data[dateStr] || {})[s.id];

            if (st === 'present') p++;
            if (st === 'absent') a++;
            if (st === 'halfday') h++;
        }

        grandPresent += p;
        grandAbsent += a;
        grandHalf += h;

        const score = p + (h * 0.5);
        const pctNum = workingDays > 0 ? (score / workingDays) * 100 : 0;
        const pctStr = pctNum.toFixed(1) + '%';

        return [i + 1, s.name, s.id, p, a, h, pctStr];
    });

    const titleStart = logoBottom + 42;

    doc.setFontSize(13);
    doc.text("MONTHLY ATTENDANCE OVERVIEW", 105, titleStart, { align: "center" });

    doc.setFontSize(10);
    doc.text(`${MONTHS[m]} ${y} | ${dept === 'All' ? 'All Departments' : dept} (Working Days: ${workingDays})`, 105, titleStart + 7, { align: "center" });

    doc.setFontSize(11);
    doc.text("Summary", 14, titleStart + 20);

    doc.setFontSize(10);
    doc.text(`Total Present : ${grandPresent}`, 14, titleStart + 27);
    doc.text(`Total Absent : ${grandAbsent}`, 14, titleStart + 33);
    doc.text(`Total Half Day: ${grandHalf}`, 14, titleStart + 39);

    doc.autoTable({
        head: [['#', 'Employee Name', 'Staff ID', 'Present', 'Absent', 'Half Day', 'Attendance %']],
        body: body,
        startY: titleStart + 47,
        styles: { fontSize: 9, cellPadding: 2, lineWidth: 0.1, lineColor: [200, 200, 200] },
        headStyles: {
            fillColor: [0, 128, 0],
            textColor: 255,
            halign: 'center',
            valign: 'middle'
        },
        columnStyles: {
            0: { halign: 'center' },
            1: { halign: 'left' },
            2: { halign: 'center' },
            3: { halign: 'center' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 6) {
                const valStr = data.cell.text[0];
                const valNum = parseFloat(valStr);
                if (valNum >= 75) data.cell.styles.textColor = [0, 100, 0];
                else if (valNum < 50 && workingDays > 0) data.cell.styles.textColor = [150, 0, 0];
                data.cell.styles.fontStyle = 'bold';
            }
        },
        didDrawPage: function (data) {
            const pageCount = doc.internal.getNumberOfPages();
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(
                `Page ${pageCount} | Generated on ${new Date().toLocaleString()} | SANJIVANI VIKAS FOUNDATION`,
                105,
                pageHeight - 8,
                { align: "center" }
            );
        }
    });

    doc.save(`SANJIVANI_Overview_${MONTHS[m]}_${y}.pdf`);
}



// ─── START ───
init();
let overviewExpanded = false;

function toggleOverviewChart() {
    const container = document.getElementById('overviewChartContainer');
    overviewExpanded = !overviewExpanded;

    if (overviewExpanded) {
        container.style.height = '500px';
    } else {
        container.style.height = '0px';
    }

    if (window.overviewChart) {
        setTimeout(() => {
            window.overviewChart.resize();
        }, 300);
    }
}
