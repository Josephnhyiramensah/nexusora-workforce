// One-off seed: platform admin + a demo tenant + its super_admin.
// Run from server/:  node scripts/seedDemo.js
require('dotenv').config();
const { connectMaster, getMasterConnection, getTenantConnection } = require('../config/db');
const env = require('../config/env');

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
  if (!(await User.findOne({ email: adminEmail }))) {
    await User.create({ name: 'Demo Admin', email: adminEmail, password: 'Demo123!', role: 'super_admin', locale: 'en' });
    console.log('Created tenant super_admin:', adminEmail, '/ Demo123!');
  } else console.log('Tenant admin exists:', adminEmail);

  console.log('\nSeed complete. Test tenant login:');
  console.log(`  curl -s -X POST http://localhost:5002/api/auth/login -H "Content-Type: application/json" -H "x-tenant-subdomain: demo" -d '{"email":"admin@demo.local","password":"Demo123!"}'`);
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
