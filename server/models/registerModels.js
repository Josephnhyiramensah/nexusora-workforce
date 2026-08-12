// Registers ALL per-tenant models on a given tenant connection. Idempotent.
function registerAllModels(conn) {
  const defs = [
    require('./tenant/User'),
    require('./tenant/CompliancePack'),
    require('./tenant/Employee'),
    require('./tenant/Attendance'),
    // ...more tenant models added here as modules are built
  ];
  for (const def of defs) {
    if (!conn.models[def.modelName]) conn.model(def.modelName, def.schema);
  }
  return conn;
}
module.exports = { registerAllModels };
