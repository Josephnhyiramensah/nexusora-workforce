const asyncHandler = require('express-async-handler');
const { resolveEffectivePack } = require('../../compliance/resolve');
const { getPack } = require('../../compliance/registry');

const getEffective = asyncHandler(async (req, res) => {
  const pack = await resolveEffectivePack(req.tenantConn, req.tenant.countryCode);
  if (!pack) return res.status(404).json({ message: `No compliance pack for ${req.tenant.countryCode}` });
  res.json(pack);
});

const getBase = asyncHandler(async (req, res) => {
  const base = getPack(req.tenant.countryCode);
  if (!base) return res.status(404).json({ message: 'No base pack' });
  res.json(base);
});

const saveOverride = asyncHandler(async (req, res) => {
  const { overrides, effectiveFrom, note } = req.body;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return res.status(400).json({ message: 'overrides object required' });
  }
  const CompliancePack = req.tenantConn.model('CompliancePack');
  const doc = await CompliancePack.findOneAndUpdate(
    { countryCode: String(req.tenant.countryCode).toUpperCase() },
    { countryCode: String(req.tenant.countryCode).toUpperCase(), overrides, effectiveFrom: effectiveFrom || new Date(), note },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const pack = await resolveEffectivePack(req.tenantConn, req.tenant.countryCode);
  res.json({ message: 'Compliance updated', effectiveFrom: doc.effectiveFrom, pack });
});

module.exports = { getEffective, getBase, saveOverride };