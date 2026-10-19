// Seed: platform admin + a demo tenant + its super_admin.
//   node scripts/seedDemo.js          → minimal (login only)
//   node scripts/seedDemo.js --full   → also fill the demo tenant with
//                                        departments, positions, employees,
//                                        leave types/requests, attendance and a
//                                        batch of audit-log entries, so the app
//                                        has realistic data to develop against.
//
// Idempotent: re-running skips anything that already exists, so --full won't
// duplicate. Seeded users are created emailVerified, so login works without
// toggling REQUIRE_EMAIL_VERIFICATION.
require('dotenv').config();
const { connectMaster, getMasterConnection, getTenantConnection } = require('../config/db');
const env = require('../config/env');

const FULL = process.argv.includes('--full');

// ---- small deterministic helpers (no external deps) ----
const pick = (arr, i) => arr[i % arr.length];
const pad = (n, w = 3) => String(n).padStart(w, '0');
function daysAgo(n) { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - n); return d; }
function workingDaysBetween(start, end) {
  let d = new Date(start), n = 0;
  while (d <= end) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) n += 1; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}
// Last `count` weekdays (most recent first), as day-start UTC dates.
function recentWeekdays(count) {
  const out = []; let back = 0;
  while (out.length < count) { const d = daysAgo(back); const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.push(d); back += 1; }
  return out;
}

// ---- demo content (Ghana-flavoured, matches the demo tenant locale GH/GHS) ----
const FIRST = ['Kwame', 'Ama', 'Kofi', 'Akosua', 'Yaw', 'Abena', 'Kwabena', 'Esi', 'Kojo', 'Adwoa', 'Kwaku', 'Afia', 'Yaa', 'Fiifi', 'Nana', 'Akua', 'Kwadwo', 'Araba', 'Ekow', 'Maame', 'Kobby', 'Serwaa', 'Paa', 'Efua', 'Gyasi'];
const LAST = ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Appiah', 'Agyeman', 'Osei', 'Addo', 'Darko', 'Annan', 'Frimpong', 'Nkrumah', 'Acheampong', 'Baffour', 'Gyan', 'Quartey', 'Tetteh', 'Danso', 'Sarpong', 'Amponsah'];
const GENDERS = ['male', 'female'];

const DEPARTMENTS = [
  { name: 'Operations', code: 'OPS' },
  { name: 'Finance', code: 'FIN' },
  { name: 'Human Resources', code: 'HR' },
  { name: 'Information Technology', code: 'IT' },
  { name: 'Security', code: 'SEC' },
  { name: 'Administration', code: 'ADM' },
];
const POSITIONS = [
  { title: 'Operations Manager', code: 'OPS-MGR', dept: 'OPS', grade: 'M2' },
  { title: 'Shift Supervisor', code: 'OPS-SUP', dept: 'OPS', grade: 'S1', headcount: 4 },
  { title: 'Plant Operator', code: 'OPS-OPR', dept: 'OPS', grade: 'G3', headcount: 10, workerClass: 'operator' },
  { title: 'Finance Manager', code: 'FIN-MGR', dept: 'FIN', grade: 'M2' },
  { title: 'Accountant', code: 'FIN-ACC', dept: 'FIN', grade: 'S2', headcount: 2 },
  { title: 'HR Officer', code: 'HR-OFF', dept: 'HR', grade: 'S1', headcount: 2 },
  { title: 'IT Support Officer', code: 'IT-SUP', dept: 'IT', grade: 'S1', headcount: 2 },
  { title: 'Security Officer', code: 'SEC-OFF', dept: 'SEC', grade: 'G2', headcount: 6, workerClass: 'field_worker' },
  { title: 'Administrative Assistant', code: 'ADM-AST', dept: 'ADM', grade: 'G3', headcount: 3 },
];
// Standard leave set (mirrors the app's POST /api/leave/types/seed defaults).
const LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'annual', paid: true, entitlementSource: 'compliance_pack', color: '#1A6B3C' },
  { name: 'Sick Leave', code: 'sick', paid: true, entitlementSource: 'fixed', daysPerYear: 12, color: '#B42318' },
  { name: 'Maternity Leave', code: 'maternity', paid: true, entitlementSource: 'fixed', daysPerYear: 84, color: '#9A6B00' },
  { name: 'Paternity Leave', code: 'paternity', paid: true, entitlementSource: 'fixed', daysPerYear: 5, color: '#2E75B6' },
  { name: 'Compassionate Leave', code: 'compassionate', paid: true, entitlementSource: 'fixed', daysPerYear: 5, color: '#6b7280' },
  { name: 'Unpaid Leave', code: 'unpaid', paid: false, entitlementSource: 'unlimited', color: '#9ca3af' },
];

async function seedTenantData(conn, actor) {
  const Employee = conn.model('Employee');
  const OrgUnit = conn.model('OrgUnit');
  const Position = conn.model('Position');
  const LeaveType = conn.model('LeaveType');
  const LeaveRequest = conn.model('LeaveRequest');
  const Attendance = conn.model('Attendance');
  const AuditLog = conn.model('AuditLog');

  if (await Employee.countDocuments() > 0) {
    console.log('Tenant already has employees — skipping --full data (idempotent).');
    return;
  }

  // 1) Departments
  const deptByCode = {};
  for (const d of DEPARTMENTS) {
    const doc = await OrgUnit.create({ type: 'department', name: d.name, code: d.code, active: true });
    deptByCode[d.code] = doc;
  }
  console.log(`Created ${DEPARTMENTS.length} departments`);

  // 2) Positions
  const posByCode = {};
  for (const p of POSITIONS) {
    const doc = await Position.create({
      title: p.title, code: p.code, grade: p.grade, headcount: p.headcount || 1,
      workerClass: p.workerClass || 'staff', department: deptByCode[p.dept] ? deptByCode[p.dept]._id : null, active: true,
    });
    posByCode[p.code] = doc;
  }
  console.log(`Created ${POSITIONS.length} positions`);

  // 3) Employees (spread across departments; first few are managers)
  const COUNT = 25;
  const employees = [];
  for (let i = 0; i < COUNT; i++) {
    const dept = pick(DEPARTMENTS, i);
    const posForDept = POSITIONS.filter((p) => p.dept === dept.code);
    const pos = posForDept.length ? pick(posForDept, i) : null;
    const first = pick(FIRST, i);
    const last = pick(LAST, i * 3 + 1);
    const startDate = daysAgo(120 + (i * 47) % 1600);   // spread hire dates over ~4 years
    const emp = await Employee.create({
      staffId: `EMP${pad(i + 1)}`,
      firstName: first,
      lastName: last,
      gender: pick(GENDERS, i),
      email: `${first}.${last}`.toLowerCase() + `@demo.local`,
      phone: `+23324${pad(1000000 + i * 137, 7)}`,
      nationality: 'Ghanaian',
      employment: {
        jobTitle: pos ? pos.title : 'Staff',
        department: dept.name,
        departmentId: deptByCode[dept.code]._id,
        positionId: pos ? posByCode[pos.code]._id : null,
        grade: pos ? pos.grade : 'G3',
        employmentType: 'permanent',
        workerClass: pos && pos.workerClass ? pos.workerClass : 'staff',
        startDate,
        confirmationStatus: ((Date.now() - startDate.getTime()) / 86400000) > 180 ? 'confirmed' : 'probation',
      },
    });
    employees.push(emp);
  }
  // Assign a line manager per department (the first employee seen in that dept).
  const headByDept = {};
  for (const e of employees) { const d = e.employment.department; if (!headByDept[d]) headByDept[d] = e; }
  for (const e of employees) {
    const head = headByDept[e.employment.department];
    if (head && String(head._id) !== String(e._id)) { e.employment.lineManager = head._id; await e.save(); }
  }
  console.log(`Created ${employees.length} employees`);

  // 4) Leave types
  const typeByCode = {};
  for (const t of LEAVE_TYPES) { typeByCode[t.code] = await LeaveType.create(t); }
  console.log(`Created ${LEAVE_TYPES.length} leave types`);

  // 5) Leave requests (varied statuses/dates)
  const statuses = ['approved', 'approved', 'pending', 'pending', 'rejected', 'approved', 'cancelled', 'pending'];
  const typeCodes = ['annual', 'sick', 'annual', 'paternity', 'annual', 'compassionate', 'sick', 'annual'];
  let leaveCount = 0;
  for (let i = 0; i < statuses.length; i++) {
    const emp = pick(employees, i * 2 + 1);
    const start = daysAgo(30 - i * 3);
    const end = daysAgo(30 - i * 3 - (1 + (i % 4)));   // 1–4 day spans
    const [s, e] = start <= end ? [start, end] : [end, start];
    const status = statuses[i];
    await LeaveRequest.create({
      employee: emp._id,
      leaveType: typeByCode[typeCodes[i]]._id,
      startDate: s, endDate: e,
      days: workingDaysBetween(s, e),
      reason: pick(['Family event', 'Medical', 'Rest', 'Travel', 'Personal'], i),
      status,
      ...(status !== 'pending' ? { decidedBy: actor._id, decidedAt: daysAgo(30 - i * 3 + 1), decisionNote: status === 'rejected' ? 'Coverage unavailable' : 'Approved' } : {}),
      createdBy: actor._id,
    });
    leaveCount += 1;
  }
  console.log(`Created ${leaveCount} leave requests`);

  // 6) Attendance — last 10 weekdays for the first 15 employees
  const days = recentWeekdays(10);
  const subset = employees.slice(0, 15);
  const HOURS = { present: 8, late: 7.5, half_day: 4, absent: 0, leave: 0, rest_day: 0, holiday: 0 };
  const LOST = { absent: 1, half_day: 0.5 };
  let attCount = 0;
  for (const emp of subset) {
    for (let di = 0; di < days.length; di++) {
      // mostly present, occasional late/absent/half_day
      const roll = (emp.staffId.charCodeAt(5) + di) % 12;
      const status = roll === 0 ? 'absent' : roll === 1 ? 'late' : roll === 2 ? 'half_day' : 'present';
      await Attendance.create({
        employee: emp._id,
        date: days[di],
        status,
        department: emp.employment.department,
        clockIn: status === 'absent' ? undefined : (status === 'late' ? '08:35' : '07:58'),
        clockOut: status === 'absent' ? undefined : '17:03',
        hoursWorked: HOURS[status] || 0,
        lostManDay: LOST[status] || 0,
        absenceReason: status === 'absent' ? 'unauthorised' : undefined,
        recordedBy: actor._id,
      });
      attCount += 1;
    }
  }
  console.log(`Created ${attCount} attendance records`);

  // 7) Audit log — a batch of recent entries so the tenant Audit Log viewer isn't
  //    empty on first look. (Normally the auditTrail middleware writes these on
  //    live mutations; here we backfill a representative set.)
  const ACTIONS = [
    ['employee.create', 'POST', '/api/employees', 201],
    ['employee.update', 'PUT', '/api/employees', 200],
    ['leave.create', 'POST', '/api/leave/requests', 201],
    ['leave.update', 'POST', '/api/leave/requests', 200],
    ['attendance.create', 'POST', '/api/attendance', 201],
    ['position.create', 'POST', '/api/positions', 201],
    ['org.create', 'POST', '/api/org', 201],
    ['settings.update', 'PATCH', '/api/settings', 200],
  ];
  const auditDocs = [];
  for (let i = 0; i < 18; i++) {
    const a = pick(ACTIONS, i);
    auditDocs.push({
      actor: { id: String(actor._id), name: actor.name, email: actor.email, role: actor.role, type: 'user' },
      action: a[0], method: a[1], path: `${a[2]}${i % 3 === 0 ? '' : '/' + pad(100 + i)}`, statusCode: a[3],
      summary: `${a[0]} by ${actor.name}`,
      ip: `154.160.${20 + (i % 6)}.${10 + i}`,
      at: new Date(Date.now() - i * 37 * 60 * 1000),   // spread back over ~11h
      meta: {},
    });
  }
  await AuditLog.insertMany(auditDocs);
  console.log(`Created ${auditDocs.length} audit-log entries`);
}

async function run() {
  await connectMaster();
  const master = getMasterConnection();
  if (!master) { console.error('No master DB — set MONGO_CLUSTER_URI in server/.env'); process.exit(1); }

  const PlatformUser = master.model('PlatformUser');
  const Tenant = master.model('Tenant');

  const padminEmail = 'admin@nexusora.tech';
  if (!(await PlatformUser.findOne({ email: padminEmail }))) {
    await PlatformUser.create({ name: 'Platform Admin', email: padminEmail, password: 'ChangeMe123!' });
    console.log('Created platform admin:', padminEmail, '/ ChangeMe123!');
  } else console.log('Platform admin exists:', padminEmail);

  const sub = 'demo';
  const dbName = `${env.TENANT_DB_PREFIX}${sub}`;
  if (!(await Tenant.findOne({ subdomain: sub }))) {
    await Tenant.create({
      name: 'Demo Plantation Ltd', subdomain: sub, dbName,
      countryCode: 'GH', baseCurrency: 'GHS', defaultLocale: 'en', enabledLocales: ['en', 'fr'],
      plan: 'enterprise', status: 'active', modules: [],
    });
    console.log('Created tenant: demo (GH / GHS / en+fr)');
  } else console.log('Tenant "demo" exists');

  const conn = await getTenantConnection(dbName);
  const User = conn.model('User');
  const adminEmail = 'admin@demo.local';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    // emailVerified:true so login works without toggling REQUIRE_EMAIL_VERIFICATION,
    // matching how the real provisioning flow creates a tenant's first admin.
    admin = await User.create({ name: 'Demo Admin', email: adminEmail, password: 'Demo123!', role: 'super_admin', locale: 'en', emailVerified: true });
    console.log('Created tenant super_admin:', adminEmail, '/ Demo123!');
  } else {
    if (!admin.emailVerified) { admin.emailVerified = true; await admin.save(); console.log('Marked existing tenant admin emailVerified'); }
    else console.log('Tenant admin exists:', adminEmail);
  }

  if (FULL) {
    console.log('\n--full: seeding demo tenant data…');
    await seedTenantData(conn, admin);
  }

  console.log('\nSeed complete. Test tenant login:');
  console.log(`  curl -s -X POST http://localhost:5002/api/auth/login -H "Content-Type: application/json" -H "x-tenant-subdomain: demo" -d '{"email":"admin@demo.local","password":"Demo123!"}'`);
  if (!FULL) console.log('  (re-run with  --full  to populate employees, leave, attendance and audit data)');
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
