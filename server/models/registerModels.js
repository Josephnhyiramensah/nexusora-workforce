// Registers ALL per-tenant models on a given tenant connection.
// Called once when a tenant connection is created (config/db.js). Idempotent.
function registerAllModels(conn) {
  const defs = [
    require('./tenant/User'),
    require('./tenant/CompliancePack'),
    // ...more tenant models added here as modules are built (Employee, Attendance, ...)
  ];
  for (const def of defs) {
    if (!conn.models[def.modelName]) {
      conn.model(def.modelName, def.schema);
    }
  }
  return conn;
}
module.exports = { registerAllModels };
