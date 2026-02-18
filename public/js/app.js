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
    if (s.success) staffList = s.data;
    if (h.success) holidayDates = h.data;
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

    // IMPORTANT: Role Logic
    applyRoleUI(userRole);

    // Initial Data
    await fetchAll();

    // Default Tab
    switchTab('dashboard');

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
        await api('/api/staff/' + editId, 'PUT', { name, dept, position: pos, role });
        showToast('Staff Updated');
    } else {
        // NEW: Passing role here
        await api('/api/staff', 'POST', { id, name, dept, position: pos, role });
        showToast('Staff Added');
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
    // Note: Backend doesn't return role in staff list usually, so might need fetch. Assuming default behavior for now in v2
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

    // ───────── CALCULATE TOTALS FOR CARDS ─────────
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalHalf = 0;
    let totalWorkingDays = 0;

    filtered.forEach(s => {
        for (let d = 1; d <= days; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            let st = (data[dateStr] || {})[s.id];

            if (!st) {
                if (holidayDates.some(h => h.date === dateStr)) continue;
                if (isWeekend(y, m, d)) continue;
            }

            totalWorkingDays++;

            if (st === 'present') totalPresent++;
            if (st === 'absent') totalAbsent++;
            if (st === 'halfday') totalHalf++;
        }
    });

    const attendancePercent = totalWorkingDays
        ? Math.round(((totalPresent + (totalHalf * 0.5)) / totalWorkingDays) * 100)
        : 0;

    // ───────── RENDER DASHBOARD STYLE CARDS ─────────
    document.getElementById('reportStats').innerHTML = `
        <div class="stat-card" style="--accent-color:var(--green)">
            <div class="stat-header">
                <span class="stat-label">Total Present</span>
            </div>
            <div class="stat-value">${totalPresent}</div>
        </div>

        <div class="stat-card" style="--accent-color:var(--red)">
            <div class="stat-header">
                <span class="stat-label">Total Absent</span>
            </div>
            <div class="stat-value">${totalAbsent}</div>
        </div>

        <div class="stat-card" style="--accent-color:var(--amber)">
            <div class="stat-header">
                <span class="stat-label">Total Half Day</span>
            </div>
            <div class="stat-value">${totalHalf}</div>
        </div>

        <div class="stat-card" style="--accent-color:var(--text-muted)">
            <div class="stat-header">
                <span class="stat-label">Working Entries</span>
            </div>
            <div class="stat-value">${totalWorkingDays}</div>
        </div>

        <div class="stat-card" style="--accent-color:var(--accent)">
            <div class="stat-header">
                <span class="stat-label">Attendance %</span>
            </div>
            <div class="stat-value">${attendancePercent}%</div>
        </div>
    `;

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
                    ${['Su','Mo','Tu','We','Th','Fr','Sa'][wd]}
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
                        background:${
                            st === 'present'
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

    document.getElementById('overviewTableBody').innerHTML = filtered.map((s, i) => {
        let p = 0, a = 0, h = 0;

        dates.forEach(d => {
            if (data[d][s.id] === 'present') p++;
            if (data[d][s.id] === 'absent') a++;
            if (data[d][s.id] === 'halfday') h++;
        });

        const totalDays = getDaysInMonth(y, m); // Simple calculation, ignoring weekends for percentage usually requires more logic, keeping simple
        // Simple Percentage for now
        const pct = Math.round(((p + (h * 0.5)) / totalDays) * 100) || 0;

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
        await api('/api/holidays', 'POST', { date, name });
        await fetchAll(); renderHolidays(); showToast('Holiday added');
    }
}
async function deleteHoliday(date) {
    if (confirm('Delete holiday?')) {
        await api('/api/holidays', 'DELETE', { date });
        await fetchAll(); renderHolidays();
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

    // ───────── TITLE ─────────
    sheet.mergeCells(`A6:${lastColumnLetter}6`);
    sheet.getCell('A6').value =
        `MONTHLY ATTENDANCE REPORT - ${MONTHS[m]} ${y}`;
    sheet.getCell('A6').font = { size: 13, bold: true };
    sheet.getCell('A6').alignment = { horizontal: 'center' };

    // ───────── HEADER ROW ─────────
    const headerRowIndex = 8;

    const headers = ['#', 'Employee Name', 'ID'];

    for (let d = 1; d <= days; d++) {
        headers.push(d);
    }

    headers.push('P', 'A', 'H');

    sheet.addRow(headers);

    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF008000' }
    };
    headerRow.alignment = { horizontal: 'center' };

    // ───────── DATA ROWS ─────────
    filtered.forEach((s, i) => {

        let p = 0, a = 0, h = 0;
        const row = [i + 1, s.name, s.id];

        for (let d = 1; d <= days; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const st = (data[dateStr] || {})[s.id];

            if (st === 'present') {
                row.push('P');
                p++;
            }
            else if (st === 'absent') {
                row.push('A');
                a++;
            }
            else if (st === 'halfday') {
                row.push('H');
                h++;
            }
            else {
                row.push('');
            }
        }

        row.push(p, a, h);

        const addedRow = sheet.addRow(row);

        // Center align day columns
        addedRow.alignment = { horizontal: 'center' };
    });

    // ───────── COLUMN WIDTHS ─────────
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 22;
    sheet.getColumn(3).width = 15;

    for (let c = 4; c <= 3 + days; c++) {
        sheet.getColumn(c).width = 4;
    }

    sheet.getColumn(4 + days).width = 6;
    sheet.getColumn(5 + days).width = 6;
    sheet.getColumn(6 + days).width = 6;

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
    doc.text("MONTHLY ATTENDANCE REPORT", pageWidth / 2, logoBottom + 45, { align: "center" });

    doc.setFontSize(11);
    doc.text(`${MONTHS[m]} ${y} | ${dept === 'All' ? 'All Departments' : dept}`, pageWidth / 2, logoBottom + 52, { align: "center" });

    const head = [['#', 'Employee Name', 'ID', ...Array.from({ length: days }, (_, i) => i + 1), 'P', 'A', 'H']];

    const body = filtered.map((s, i) => {
        let p = 0, a = 0, h = 0;
        const row = [i + 1, s.name, s.id];

        for (let d = 1; d <= days; d++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const st = (data[dateStr] || {})[s.id];

            if (st === 'present') { row.push('P'); p++; }
            else if (st === 'absent') { row.push('A'); a++; }
            else if (st === 'halfday') { row.push('H'); h++; }
            else row.push('');
        }

        row.push(p, a, h);
        return row;
    });

    doc.autoTable({
        head,
        body,
        startY: logoBottom + 60,
        styles: { fontSize: 6 },
        headStyles: {
            fillColor: [0, 128, 0],
            textColor: 255
        },
        didDrawPage: function () {
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(8);
            doc.text(
                `Generated on ${new Date().toLocaleDateString()} | SANJIVANI VIKAS FOUNDATION`,
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
    sheet.addRow(headers);

    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF008000' }
    };

    // ───────── DATA ─────────
    let grandPresent = 0, grandAbsent = 0, grandHalf = 0;

    filtered.forEach((s, i) => {
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

        const pct = ((p + (h * 0.5)) / totalDays) * 100;

        sheet.addRow([i + 1, s.name, s.id, p, a, h, pct.toFixed(1) + '%']);
    });

    // ───────── COLUMN WIDTHS ─────────
    sheet.columns = [
        { width: 5 },
        { width: 25 },
        { width: 18 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 15 }
    ];

    // ───────── SUMMARY ─────────
    const summaryStart = sheet.lastRow.number + 2;

    sheet.getCell(`A${summaryStart}`).value = 'Summary';
    sheet.getCell(`A${summaryStart}`).font = { bold: true };

    sheet.getCell(`A${summaryStart + 1}`).value = `Total Present: ${grandPresent}`;
    sheet.getCell(`A${summaryStart + 2}`).value = `Total Absent: ${grandAbsent}`;
    sheet.getCell(`A${summaryStart + 3}`).value = `Total Half Day: ${grandHalf}`;

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

        const pct = ((p + (h * 0.5)) / totalDays) * 100;

        return [i + 1, s.name, s.id, p, a, h, pct.toFixed(1) + '%'];
    });

    const titleStart = logoBottom + 42;

    doc.setFontSize(13);
    doc.text("MONTHLY ATTENDANCE OVERVIEW", 105, titleStart, { align: "center" });

    doc.setFontSize(10);
    doc.text(`${MONTHS[m]} ${y} | ${dept === 'All' ? 'All Departments' : dept}`, 105, titleStart + 7, { align: "center" });

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
        styles: { fontSize: 9 },
        headStyles: {
            fillColor: [0, 128, 0],
            textColor: 255
        },
        didDrawPage: function () {
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(8);
            doc.text(
                `Generated on ${new Date().toLocaleDateString()} | SANJIVANI VIKAS FOUNDATION`,
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

    container.style.height = overviewExpanded ? '600px' : '300px';

    if (window.overviewChart) {
        window.overviewChart.resize();
    }
}
