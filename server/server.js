const app = require('./app');
const env = require('./config/env');
const { connectMaster } = require('./config/db');

async function start() {
  try {
    await connectMaster();               // non-fatal in dev if URI absent
  } catch (e) {
    console.error('[startup] Master DB connection failed:', e.message);
  }
  app.listen(env.PORT, () => {
    console.log(`Nexusora Workforce API listening on :${env.PORT} (${env.NODE_ENV})`);
  });
}
start();
