// Plan-based feature gating (C2). Runs AFTER resolveTenant, so req.tenant is set.
// Each guard returns a structured 403 the client can turn into an upgrade prompt
// (code: 'plan_upgrade_required') rather than a bare "Forbidden".
const { resolveEntitlements, MODULES, FEATURES } = require('../config/plans');

function attachEntitlements(req, res, next) {
  req.entitlements = resolveEntitlements(req.tenant || {});
  return next();
}

function requireModule(moduleKey) {
  return (req, res, next) => {
    const ent = req.entitlements || resolveEntitlements(req.tenant || {});
    if (ent.modules.includes(moduleKey)) return next();
    return res.status(403).json({
      code: 'plan_upgrade_required',
      message: `${MODULES[moduleKey] || moduleKey} isn't included in your ${ent.planLabel} plan.`,
      required: { module: moduleKey },
      plan: ent.plan,
    });
  };
}

function requireFeature(featureKey) {
  return (req, res, next) => {
    const ent = req.entitlements || resolveEntitlements(req.tenant || {});
    if (ent.features.includes(featureKey)) return next();
    return res.status(403).json({
      code: 'plan_upgrade_required',
      message: `${FEATURES[featureKey] || featureKey} isn't included in your ${ent.planLabel} plan.`,
      required: { feature: featureKey },
      plan: ent.plan,
    });
  };
}

// Blocks access when the subscription has lapsed past its grace window. Allows
// trial, active and grace (read-write continues during grace); expired/suspended
// are refused with a billing code the client routes to the billing screen.
function requireActiveSubscription(req, res, next) {
  const status = (req.tenant && req.tenant.status) || 'active';
  if (status === 'expired' || status === 'suspended') {
    return res.status(402).json({
      code: 'subscription_inactive',
      message: 'Your subscription is not active. Please renew to continue.',
      status,
    });
  }
  return next();
}

module.exports = { attachEntitlements, requireModule, requireFeature, requireActiveSubscription };
