// ═══════════════════════════════════════════════════════
// STAFF ATTENDANCE MANAGER — CLIENT SIDE CONTROLLER
// ═══════════════════════════════════════════════════════

// ─── IN-MEMORY CACHE ───
// We maintain local state to reduce API load and improve responsiveness.
let staffList    = [];
let attCache     = {};  // Cache for daily attendance: { "YYYY-MM-DD": { staffId: status } }
let monthCache   = {};  // Cache for monthly reports: { "YYYY-MM": { staffId: status } }
let holidayDates = [];  // Array of holiday date strings ["YYYY-MM-DD"]

// ─── HELPER FUNCTIONS ───

// Get today's date in YYYY-MM-DD format
const today = () => new Date().toISOString().split('T')[0];

// Format ISO date to readable string (e.g., "Mon, Jan 12, 2024")
const formatDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
});

// Get total days in a specific month/year
const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

// Check if a specific date is a Sunday
const isWeekend = (y, m, d) => new Date(y, m, d).getDay() === 0;

// Generate 2-letter initials from a name (e.g., "Rahul Sharma" -> "RS")
const initials = n => n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);

// Generate a consistent pastel color based on the characters in the name
const avatarColor = n => {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
  return ['#4f8aff', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c', '#67e8f9'][Math.abs(h) % 7];
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ─── UI UTILITIES ───

// Show a temporary floating toast message
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ─── SERVER STATUS CHECK ───
async function pingServer() {
  try {
    await fetch('/api/staff'); // Simple GET to test connection
    document.getElementById('serverDot').classList.remove('off');
    document.getElementById('serverLabel').textContent = 'Connected';
    return true;
  } catch {
    document.getElementById('serverDot').classList.add('off');
    document.getElementById('serverLabel').textContent = 'No connection';
    return false;
  }
}

// ═══════════════════════════════════════════════════════
// API CLIENT (DATA FETCHING LAYER)
// ═══════════════════════════════════════════════════════

async function fetchStaff() {
  const res = await fetch('/api/staff');
  const json = await res.json();
  staffList = json.data;
  return staffList;
}

async function fetchHolidays() {
  const res = await fetch('/api/holidays');
  const json = await res.json();
  holidayDates = json.data;   // keep full objects (date + name)
  return holidayDates;
}

async function fetchDepts() {
  const res = await fetch('/api/staff/departments');
  return (await res.json()).data;
}

async function fetchAttendance(date) {
  const res = await fetch('/api/attendance?date=' + date);
  const json = await res.json();
  attCache[date] = json.data; // Update cache
  return json.data;
}

async function fetchMonthAttendance(year, month) {
  const res = await fetch(`/api/attendance/month?year=${year}&month=${month}`);
  const json = await res.json();
  monthCache[`${year}-${month}`] = json.data; // Update cache
  return json.data;
}

async function postAttendance(staffId, date, status) {
  const res = await fetch('/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, date, status })
  });
  return (await res.json()).success;
}

async function deleteAttendance(staffId, date) {
  const res = await fetch('/api/attendance', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId, date })
  });
  return (await res.json()).success;
}

async function postStaff(staff) {
  const res = await fetch('/api/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(staff)
  });
  return await res.json();
}

async function putStaff(id, staff) {
  const res = await fetch(`/api/staff/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(staff)
  });
  return await res.json();
}

async function deleteStaffAPI(id) {
  const res = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
  return await res.json();
}

function applyEmployeeView() {

  // Hide Staff tab
  document.querySelectorAll('.tab-btn')[2].style.display = 'none';

  // Hide Mark Attendance tab
  document.querySelectorAll('.tab-btn')[1].style.display = 'none';

  // Hide Dashboard tab
  document.querySelectorAll('.tab-btn')[0].style.display = 'none';

  // Hide Holiday panel
  const holidayPanel = document.getElementById('holidayPanel');
  if (holidayPanel) holidayPanel.style.display = 'none';

  // Automatically switch to Report tab
  switchTab('report');
}

// ═══════════════════════════════════════════════════════
// APP INITIALIZATION & NAVIGATION
// ═══════════════════════════════════════════════════════

async function init() {
  // Get logged-in user info
const res = await fetch('/api/me');
const data = await res.json();

if (data.success) {
  const role = data.user.role;

  if (role === 'employee') {
    applyEmployeeView();
  }
}

  // Set today's date in top bar
  document.getElementById('currentDateDisplay').textContent = formatDate(today());
  document.getElementById('markDate').value = today();

  // Start the live clock for the dashboard
  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  // Check connectivity
  const connected = await pingServer();
  if (!connected) {
    showToast('⚠️ Server not running — start it with: npm start');
    return;
  }

  // Initial data load
  await fetchHolidays();
  await loadHolidayList();
  await fetchStaff();

  // Seed sample data if database is empty (First Run Experience)
  if (staffList.length === 0) {
    const samples = [
      { id: 'EMP001', name: 'Rahul Sharma', dept: 'Sales', position: 'Sales Manager' },
      { id: 'EMP002', name: 'Priya Mehta', dept: 'HR', position: 'HR Coordinator' },
      { id: 'EMP003', name: 'Ajay Kumar', dept: 'IT', position: 'Developer' },
      { id: 'EMP004', name: 'Sneha Patel', dept: 'IT', position: 'QA Engineer' },
      { id: 'EMP005', name: 'Vikram Rao', dept: 'Sales', position: 'Sales Rep' },
      { id: 'EMP006', name: 'Anita Desai', dept: 'Finance', position: 'Accountant' },
    ];
    for (const s of samples) await postStaff(s);
    await fetchStaff();
    showToast('Sample staff loaded — feel free to edit!');
  }

  // Load the dashboard view by default
  renderDashboard();
}

// Update the HH:MM clock on the dashboard
function updateLiveClock() {
  const el = document.getElementById('liveClock');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}

// Switch between tabs (Dashboard, Mark, Staff, Report)
// Switch between tabs (Dashboard, Mark, Staff, Holiday, Report)
function switchTab(name) {

  // Remove active from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Activate clicked tab
  const activeBtn = document.querySelector(
    `.tab-btn[onclick="switchTab('${name}')"]`
  );
  if (activeBtn) activeBtn.classList.add('active');

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
  });

  // Show selected page
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');

  // Load content dynamically
  if (name === 'dashboard') renderDashboard();
  if (name === 'mark')      renderMarkPage();
  if (name === 'staff')     { populateDeptFilters(); renderStaffTable(); }
  if (name === 'holiday')   loadHolidayList();
  if (name === 'report')    { populateReportSelectors(); renderReport(); }
}


// Populate department dropdowns dynamically based on existing staff data
async function populateDeptFilters() {
  const depts = await fetchDepts();
  const optHtml = '<option value="All">All Departments</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  
  ['markDeptFilter', 'staffDeptFilter', 'reportDeptFilter'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = optHtml;
  });
  
  // Update datalist for Add Staff modal
  document.getElementById('deptList').innerHTML = depts.map(d => `<option value="${d}">`).join('');
}

// ═══════════════════════════════════════════════════════
// DASHBOARD LOGIC (NEW MODERN VERSION)
// ═══════════════════════════════════════════════════════
let pieChart = null;

async function renderDashboard() {
await fetchStaff();
await fetchAttendance(today());
const dayAtt = attCache[today()] || {};


  // 1. Calculate Statistics
  let counts = { present: 0, absent: 0, halfday: 0, holiday: 0, weekend: 0, unmarked: 0 };
  
  staffList.forEach(s => {
    const st = dayAtt[s.id];
    if (st) counts[st]++;
    else counts.unmarked++;
  });

  // 2. Update Stat Cards (DOM elements)
  ['present', 'absent', 'halfday', 'unmarked'].forEach(k => {
    const el = document.getElementById('stat-' + k);
    if (el) el.textContent = counts[k];
  });

  // Update center count of the chart
  const totalEl = document.getElementById('totalStaffCount');
  if (totalEl) totalEl.textContent = staffList.length;

  // 3. Render Chart.js Doughnut Chart
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (pieChart) pieChart.destroy(); // Prevent canvas reuse errors
  
  const labels = [], data = [], colors = [];
  
  // Push data conditionally to keep chart clean
  if (counts.present) { labels.push('Present'); data.push(counts.present); colors.push('#34d399'); }
  if (counts.absent)  { labels.push('Absent');  data.push(counts.absent);  colors.push('#f87171'); }
  if (counts.halfday) { labels.push('Half Day'); data.push(counts.halfday); colors.push('#fbbf24'); }
  if (counts.unmarked){ labels.push('Unmarked'); data.push(counts.unmarked); colors.push('#252a36'); }

  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%', // Thin ring style
      plugins: {
        legend: { display: false }, // Hide default legend
        tooltip: {
          backgroundColor: '#181b24',
          bodyColor: '#e2e4ea',
          borderColor: '#252a36',
          borderWidth: 1,
          padding: 10,
          displayColors: true,
          usePointStyle: true,
        }
      }
    }
  });

  // 4. Render Recent Staff List (Modern Style)
  const el = document.getElementById('dashStaffList');
  if (!staffList.length) {
    el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:30px;">No staff yet.</div>';
    return;
  }
  
  el.innerHTML = staffList.map(s => {
    const st = dayAtt[s.id] || 'unmarked';
    
    // Create pretty label
    let label = st.charAt(0).toUpperCase() + st.slice(1);
    if (st === 'halfday') label = 'Half Day';
    
    // Generate List Item HTML
    return `
      <div class="list-item">
        <div class="att-avatar" style="background:${avatarColor(s.name)};color:#fff;">${initials(s.name)}</div>
        <div class="list-info">
          <div class="list-name">${s.name}</div>
          <div class="list-sub">${s.dept || '—'}</div>
        </div>
        <span class="badge badge-${st}">${label}</span>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
// HOLIDAY MANAGER
// ═══════════════════════════════════════════════════════

async function addHoliday() {
  const date = document.getElementById('holidayDate').value;
  const name = document.getElementById('holidayName').value;

  if (!date) {
    showToast('Select date');
    return;
  }

  await fetch('/api/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, name })
  });

  showToast('Holiday added');
  await loadHolidayList();
  
  // Refresh views if currently active
  if(document.getElementById('page-mark').classList.contains('active')) renderMarkPage();
  if(document.getElementById('page-report').classList.contains('active')) renderReport();
}

async function loadHolidayList() {
  await fetchHolidays();
  const ul = document.getElementById('holidayList');
  if (!ul) return;

  ul.innerHTML = '';

  holidayDates.forEach(h => {
    const li = document.createElement('div');
    li.className = 'holiday-item';
    li.innerHTML = `
      <div>
        <strong>${h.name || 'Holiday'}</strong><br>
        <span style="color:var(--text-muted); font-size:12px;">
          ${formatDate(h.date)}
        </span>
      </div>
      <button class="btn btn-danger" 
              style="padding:6px 10px; font-size:12px;"
              onclick="removeHoliday('${h.date}')">
        Delete
      </button>
    `;
    ul.appendChild(li);
  });
}


async function removeHoliday(date) {
  await fetch('/api/holidays', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date })
  });

  showToast('Holiday removed');
  await loadHolidayList();
  
  // Refresh views
  if(document.getElementById('page-mark').classList.contains('active')) renderMarkPage();
  if(document.getElementById('page-report').classList.contains('active')) renderReport();
}

// ═══════════════════════════════════════════════════════
// MARK ATTENDANCE PAGE
// ═══════════════════════════════════════════════════════

async function renderMarkPage() {
  const dateInput = document.getElementById('markDate');
  if (!dateInput.value) dateInput.value = today();
  const date = dateInput.value;
  const dept = document.getElementById('markDeptFilter').value;

  await fetchStaff();
  await populateDeptFilters();
  const dayAtt = await fetchAttendance(date);

  // Filter staff by selected department
  let filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);

  if (!filtered.length) {
    document.getElementById('attGrid').innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--text-muted);">No staff found.</div>';
    return;
  }

  const statuses = ['present', 'absent', 'halfday', 'holiday', 'weekend'];
  const labels   = ['Present', 'Absent', 'Half Day', 'Holiday', 'Weekend'];

  // Render Grid
  document.getElementById('attGrid').innerHTML = filtered.map(s => {
    const current = dayAtt[s.id] || '';
    return `<div class="card att-row">
      <div class="att-avatar" style="background:${avatarColor(s.name)};color:#fff;">${initials(s.name)}</div>
      <div>
        <div class="att-name">${s.name}</div>
        <div class="att-dept">${s.id} &nbsp;•&nbsp; ${s.dept || '—'} &nbsp;•&nbsp; ${s.position || '—'}</div>
      </div>
      <div class="status-buttons">
        ${statuses.map((st, i) => `
          <button class="status-btn ${current === st ? 'active-' + st : ''}" 
                  onclick="setAttendance('${date}','${s.id}','${st}')">
            ${labels[i]}
          </button>
        `).join('')}
      </div>
    </div>`;
  }).join('');
}

async function logout() {
  const res = await fetch('/api/logout', { method: 'POST' });
  const data = await res.json();

  if (data.success) {
    window.location.href = '/';
  } else {
    showToast('Logout failed');
  }
}

async function setAttendance(date, staffId, status) {
  const dayAtt = attCache[date] || {};
  
  // If clicking the same status, toggle it off (delete)
  if (dayAtt[staffId] === status) {
    await deleteAttendance(staffId, date);
    if (attCache[date]) delete attCache[date][staffId];
  } else {
    // Otherwise upsert new status
    await postAttendance(staffId, date, status);
    if (!attCache[date]) attCache[date] = {};
    attCache[date][staffId] = status;
  }
  
  showToast('Attendance updated');
  renderMarkPage(); // Re-render to show active state
}

async function markAllPresent() {
  const date = document.getElementById('markDate').value || today();
  const dept = document.getElementById('markDeptFilter').value;
  
  const filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);
  
  for (const s of filtered) {
    await postAttendance(s.id, date, 'present');
    if (!attCache[date]) attCache[date] = {};
    attCache[date][s.id] = 'present';
  }
  
  showToast('All marked as Present');
  renderMarkPage();
}

// ═══════════════════════════════════════════════════════
// STAFF MANAGEMENT PAGE
// ═══════════════════════════════════════════════════════

function openAddStaff() {
  document.getElementById('staffModalTitle').textContent = 'Add New Staff';
  document.getElementById('editStaffId').value = '';
  ['staffName', 'staffId', 'staffDept', 'staffPosition'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('staffModal').classList.add('show');
}

function closeStaffModal() {
  document.getElementById('staffModal').classList.remove('show');
}

async function saveStaff() {
  const name     = document.getElementById('staffName').value.trim();
  const id       = document.getElementById('staffId').value.trim();
  const dept     = document.getElementById('staffDept').value.trim();
  const position = document.getElementById('staffPosition').value.trim();
  const editId   = document.getElementById('editStaffId').value;

  if (!name || !id) { showToast('Name and Staff ID are required'); return; }

  if (editId) {
    // Update existing
    const res = await putStaff(editId, { name, dept, position });
    if (res.success) showToast('Staff updated');
    else showToast(res.error);
  } else {
    // Create new
    const res = await postStaff({ id, name, dept, position });
    if (res.success) showToast('Staff added');
    else { showToast(res.error); return; }
  }
  
  closeStaffModal();
  await fetchStaff();
  populateDeptFilters();
  renderStaffTable();
}

function editStaff(id) {
  const s = staffList.find(x => x.id === id); 
  if (!s) return;
  
  document.getElementById('staffModalTitle').textContent = 'Edit Staff';
  document.getElementById('editStaffId').value   = id;
  document.getElementById('staffName').value     = s.name;
  document.getElementById('staffId').value       = s.id;
  document.getElementById('staffDept').value     = s.dept || '';
  document.getElementById('staffPosition').value = s.position || '';
  document.getElementById('staffModal').classList.add('show');
}

async function deleteStaff(id) {
  if(!confirm('Are you sure you want to delete this staff member?')) return;
  
  const res = await deleteStaffAPI(id);
  if (res.success) showToast('Staff removed');
  
  await fetchStaff();
  renderStaffTable();
}

async function resetUserPassword(staffId) {
  if (!confirm('Reset password to default (sam123456)?')) return;

  const res = await fetch('/api/admin/reset-user-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId })
  });

  const data = await res.json();

  if (data.success) {
    showToast('Password reset to default ✓');
  } else {
    showToast(data.error);
  }
}

async function renderStaffTable() {
  await fetchStaff();
  const search = document.getElementById('staffSearch').value.toLowerCase();
  const dept   = document.getElementById('staffDeptFilter').value;
  
  let filtered = staffList.filter(s => {
    if (dept !== 'All' && s.dept !== dept) return false;
    return s.name.toLowerCase().includes(search) || s.id.toLowerCase().includes(search);
  });

  const tbody = document.getElementById('staffTableBody');
  if (!filtered.length) {
    tbody.innerHTML = '';
    document.getElementById('staffEmpty').textContent = staffList.length === 0 ? 'No staff added yet. Click "Add Staff" to begin.' : 'No results match your filters.';
    return;
  }
  
  document.getElementById('staffEmpty').textContent = '';
  
  tbody.innerHTML = filtered.map((s, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="att-avatar" style="background:${avatarColor(s.name)};color:#fff;width:30px;height:30px;font-size:12px;">${initials(s.name)}</div>
          <span style="font-weight:600;">${s.name}</span>
        </div>
      </td>
      <td style="color:var(--accent);font-weight:600;">${s.id}</td>
      <td>${s.dept || '—'}</td>
      <td style="color:var(--text-muted);">${s.position || '—'}</td>
      <td style="text-align:right;">
        <div style="display:flex;gap:6px;justify-content:flex-end;">
  <button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="editStaff('${s.id}')">
    Edit
  </button>

  <button class="btn btn-outline" style="padding:6px 12px;font-size:12px;" onclick="resetUserPassword('${s.id}')">
    Reset
  </button>

  <button class="btn btn-danger" style="padding:6px 12px;font-size:12px;" onclick="deleteStaff('${s.id}')">
    Delete
  </button>
</div>

      </td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════
// MONTHLY REPORT PAGE
// ═══════════════════════════════════════════════════════

function populateReportSelectors() {
  const now = new Date();
  document.getElementById('reportMonth').innerHTML = MONTHS.map((m, i) => `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  
  let yHtml = '';
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
    yHtml += `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`;
  }
  document.getElementById('reportYear').innerHTML = yHtml;
  populateDeptFilters();
}

async function renderReport() {
  const month = parseInt(document.getElementById('reportMonth').value);
  const year  = parseInt(document.getElementById('reportYear').value);
  const dept  = document.getElementById('reportDeptFilter').value;
  const days  = getDaysInMonth(year, month);

  await fetchStaff();
  await fetchHolidays();
  const monthData = await fetchMonthAttendance(year, month);

  let filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);
  let totals = { present: 0, absent: 0, halfday: 0, holiday: 0, weekend: 0 };

  // 1. Build Header
  let headHtml = '<tr><th class="sticky-col name-col">Staff</th>';
  for (let d = 1; d <= days; d++) {
    const wd = new Date(year, month, d).getDay();
    const isWe = wd === 0 || wd === 6; // Weekend highlight
    headHtml += `<th style="${isWe ? 'color:var(--gray-status);' : ''}">
      <div style="font-weight:700;">${d}</div>
      <div style="font-size:10px;color:var(--text-muted);">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][wd]}</div>
    </th>`;
  }
  headHtml += '<th style="position:sticky;right:0;background:var(--card);min-width:70px;">Total</th></tr>';
  document.getElementById('reportThead').innerHTML = headHtml;

  // 2. Build Rows
  let bodyHtml = '';
  filtered.forEach(s => {
    let row = `<tr>
      <td class="sticky-col" style="font-weight:600;background:var(--card);">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="att-avatar" style="background:${avatarColor(s.name)};color:#fff;width:28px;height:28px;font-size:11px;">${initials(s.name)}</div>
          <div><div>${s.name}</div><div style="font-size:11px;color:var(--text-muted);">${s.dept || '—'}</div></div>
        </div>
      </td>`;
      
    let pC = 0, aC = 0, hC = 0; // Per-staff counters
    
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      // Determine status: Manual Entry > Holiday > Weekend
      let st = (monthData[dateStr] || {})[s.id];
      if (!st) {
        if (holidayDates.some(h => h.date === dateStr)) st = 'holiday';
        else if (isWeekend(year, month, d)) st = 'weekend';
      }
      
      const abbr = { present: 'P', absent: 'A', halfday: 'H', holiday: 'Ho', weekend: 'W' }[st] || '—';
      const cellClass = st ? 'cell-' + st : 'cell-empty';

      // Update global stats
      if (st === 'present') { pC++; totals.present++; }
      if (st === 'absent')  { aC++; totals.absent++; }
      if (st === 'halfday') { hC++; totals.halfday++; }
      if (st === 'holiday') totals.holiday++;
      if (st === 'weekend') totals.weekend++;

      row += `<td class="${cellClass}" style="font-size:12px;">${abbr}</td>`;
    }
    
    row += `<td style="position:sticky;right:0;background:var(--card);font-weight:700;font-size:13px;color:var(--green);">${pC}<span style="font-size:10px;color:var(--text-muted);font-weight:500;"> / ${days - hC}</span></td></tr>`;
    bodyHtml += row;
  });
  document.getElementById('reportTbody').innerHTML = bodyHtml;

  // 3. Update Totals Widget
  document.getElementById('reportStats').innerHTML = `
    <div class="card stat-card"><div class="stat-value" style="color:var(--green)">${totals.present}</div><div class="stat-label">Present</div></div>
    <div class="card stat-card"><div class="stat-value" style="color:var(--red)">${totals.absent}</div><div class="stat-label">Absent</div></div>
    <div class="card stat-card"><div class="stat-value" style="color:var(--amber)">${totals.halfday}</div><div class="stat-label">Half Day</div></div>
    <div class="card stat-card"><div class="stat-value" style="color:var(--purple)">${totals.holiday}</div><div class="stat-label">Holiday</div></div>
    <div class="card stat-card"><div class="stat-value" style="color:var(--gray-status)">${totals.weekend}</div><div class="stat-label">Weekend</div></div>`;
}

// ═══════════════════════════════════════════════════════
// EXCEL EXPORT
// ═══════════════════════════════════════════════════════

async function downloadExcel() {
  const month = parseInt(document.getElementById('reportMonth').value);
  const year  = parseInt(document.getElementById('reportYear').value);
  const dept  = document.getElementById('reportDeptFilter').value;
  const days  = getDaysInMonth(year, month);

  await fetchStaff();
  await fetchHolidays();
  const monthData = await fetchMonthAttendance(year, month);
  let filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);

  // Build Excel Headers
  let header = ['#', 'Name', 'Staff ID', 'Department', 'Position'];
  for (let d = 1; d <= days; d++) header.push(String(d));
  header.push('Present', 'Absent', 'Half Days');

  let rows = [header];
  filtered.forEach((s, i) => {
    let row = [i + 1, s.name, s.id, s.dept || '', s.position || ''];
    let pC = 0, aC = 0, hC = 0;
    
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      let st = (monthData[dateStr] || {})[s.id];
      if (!st) {
        if (holidayDates.some(h => h.date === dateStr)) st = 'holiday';
        else if (isWeekend(year, month, d)) st = 'weekend';
      }
      
      row.push({ present: 'P', absent: 'A', halfday: 'H', holiday: 'Ho', weekend: 'W' }[st] || '');
      
      if (st === 'present') pC++;
      if (st === 'absent')  aC++;
      if (st === 'halfday') hC++;
    }
    row.push(pC, aC, hC);
    rows.push(row);
  });

  // Write to File
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = header.map((h, i) => ({ wch: i < 5 ? Math.max(h.length + 4, 16) : 6 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, MONTHS[month]);
  XLSX.writeFile(wb, `Attendance_${MONTHS[month]}_${year}.xlsx`);
  showToast('Excel downloaded ✓');
}

// ═══════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════

async function downloadPDF() {
  const month = parseInt(document.getElementById('reportMonth').value);
  const year  = parseInt(document.getElementById('reportYear').value);
  const dept  = document.getElementById('reportDeptFilter').value;
  const days  = getDaysInMonth(year, month);

  await fetchStaff();
  const monthData = await fetchMonthAttendance(year, month);
  let filtered = dept === 'All' ? staffList : staffList.filter(s => s.dept === dept);

 const { jsPDF } = window.jspdf;

const doc = new jsPDF({
  orientation: 'landscape',
  unit: 'mm',
  format: 'a4'
});


  // PDF Header
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(79, 138, 255);
  doc.text('Staff Attendance Report', 14, 14);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 128, 153);
  doc.text(`${MONTHS[month]} ${year}  |  ${dept === 'All' ? 'All Departments' : dept}`, 14, 22);

  // PDF Legend
  const legendItems = [
    { label: 'P – Present', color: [52, 211, 153] },
    { label: 'A – Absent', color: [248, 113, 113] },
    { label: 'H – Half Day', color: [251, 191, 36] },
    { label: 'Ho – Holiday', color: [167, 139, 250] },
    { label: 'W – Weekend', color: [100, 116, 139] }
  ];
  doc.setFontSize(8);
  legendItems.forEach((li, i) => {
    const x = 14 + i * 40;
    doc.setFillColor(...li.color);
    doc.roundedRect(x, 28, 4, 4, 0.5, 0.5, 'F');
    doc.setTextColor(0, 0, 0);
    doc.text(li.label, x + 6, 31.2);
  });

  // Data Preparation for AutoTable
  let head = ['#', 'Name', 'ID', 'Dept'];
  for (let d = 1; d <= days; d++) head.push(String(d));
  head.push('P', 'A', 'H');

  const statusMap = {
  'P – Present': 'P',
  'A – Absent': 'A',
  'H – Half Day': 'H',
  'Ho – Holiday': 'Ho',
  'W – Weekend': 'W'
};

const statusColors = {};

legendItems.forEach(li => {
  const code = statusMap[li.label];
  if (code) {
    statusColors[code] = li.color;
  }
});


  let body = filtered.map((s, i) => {
    let row = [i + 1, s.name, s.id, s.dept || '—'];
    let pC = 0, aC = 0, hC = 0;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const st = (monthData[dateStr] || {})[s.id] || (isWeekend(year, month, d) ? 'weekend' : '');
      
      row.push({ present: 'P', absent: 'A', halfday: 'H', holiday: 'Ho', weekend: 'W' }[st] || '');
      
      if (st === 'present') pC++;
      if (st === 'absent')  aC++;
      if (st === 'halfday') hC++;
    }
    row.push(pC, aC, hC);
    return row;
  });

  // Draw Table
importAutoTable(doc);

function importAutoTable(doc) {
  window.jspdf.jsPDF.API.autoTable.call(doc, {
    startY: 36,
    head: [head],
    body,
    theme: 'plain',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      lineWidth: .1,
      lineColor: [60, 65, 80],
      textColor: [0, 0, 0]
    },
    headStyles: {
      fillColor: [30, 33, 46],
      textColor: [79, 138, 255],
      fontStyle: 'bold',
      fontSize: 6.5
    }
  });
}

  doc.save(`Attendance_${MONTHS[month]}_${year}.pdf`);
  showToast('PDF downloaded ✓');
}

// ─── HOLIDAY UI TOGGLE ───
function toggleHolidayManager() {
  const panel = document.getElementById('holidayPanel');
  panel.classList.toggle('collapsed');
}

// ─── STARTUP ───

// Close modal when clicking outside of it
document.getElementById('staffModal').addEventListener('click', function(e) {
  if (e.target === this) closeStaffModal();
});

// Run initialization when DOM is ready
window.addEventListener('DOMContentLoaded', init);

function openPasswordModal() {
  document.getElementById('passwordModal').classList.add('show');
}

function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
}

async function resetPassword() {
  const currentPassword = document.getElementById('currentPassword').value.trim();
  const newPassword     = document.getElementById('newPassword').value.trim();

  if (!currentPassword || !newPassword) {
    showToast('All fields required');
    return;
  }

  const res = await fetch('/api/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword })
  });

  const data = await res.json();

  if (data.success) {
    showToast('Password updated ✓');
    closePasswordModal();
  } else {
    showToast(data.error);
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/';
}
