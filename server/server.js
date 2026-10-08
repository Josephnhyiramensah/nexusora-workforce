const app = require('./app');
const env = require('./config/env');
const { connectMaster } = require('./config/db');
const { startReminderScheduler } = require('./modules/reminders/reminders.service');

async function start() {
  try {
    await connectMaster();               // non-fatal in dev if URI absent
  } catch (e) {
    console.error('[startup] Master DB connection failed:', e.message);
  }
  app.listen(env.PORT, () => {
    console.log(`Nexusora Workforce API listening on :${env.PORT} (${env.NODE_ENV})`);
  });
  // Daily overdue-reminder sweep (in-app notifications + optional email).
  try { startReminderScheduler(); } catch (e) { console.error('[reminders] scheduler failed to start:', e.message); }
}
start();
