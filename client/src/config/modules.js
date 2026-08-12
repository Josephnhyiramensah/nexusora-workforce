// Home Screen tile map — the 17 modules grouped into sections.
// `enabled:false` tiles render as "Soon". Role visibility: a tile shows if the user's role
// is listed, or the tile is 'all', or the user is super_admin (who sees everything).
export const SECTIONS = [
  { key: 'workforce', tiles: [
    { key: 'workforcePlanning', roles: ['hr_manager'], enabled: false },
    { key: 'employees', route: '/employees', roles: ['hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'], enabled: true },
    { key: 'jobDescriptions', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'talent', tiles: [
    { key: 'recruitment', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'onboarding', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'learning', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'succession', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'operations', tiles: [
    { key: 'attendance', route: '/attendance', roles: ['hr_manager', 'hr_officer', 'line_manager'], enabled: true },
    { key: 'leave', roles: ['hr_manager', 'hr_officer', 'line_manager', 'employee'], enabled: false },
  ]},
  { key: 'payBenefits', tiles: [
    { key: 'payroll', roles: ['payroll_officer', 'hr_manager'], enabled: false },
    { key: 'welfare', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'performanceCulture', tiles: [
    { key: 'performance', roles: ['hr_manager', 'line_manager'], enabled: false },
    { key: 'relations', roles: ['hr_manager', 'ir_officer'], enabled: false },
    { key: 'engagement', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'selfService', tiles: [
    { key: 'selfService', roles: ['all'], enabled: false },
  ]},
  { key: 'adminAnalytics', tiles: [
    { key: 'documents', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'analytics', roles: ['hr_manager'], enabled: false },
  ]},
];

export function visibleTiles(tiles, role) {
  return tiles.filter((t) => t.roles.includes('all') || role === 'super_admin' || t.roles.includes(role));
}
