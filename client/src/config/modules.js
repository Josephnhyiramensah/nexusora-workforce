// Home Screen tile map — the 17 modules grouped into sections.
// `enabled:false` tiles render as "Soon". Role visibility: a tile shows if the user's role
// is listed, or the tile is 'all', or the user is super_admin (who sees everything).
export const SECTIONS = [
  { key: 'workforce', tiles: [
    { key: 'workforcePlanning', icon: 'ClipboardList', accent: '#123a7e', roles: ['hr_manager'], enabled: false },
    { key: 'employees', icon: 'Users', accent: '#012158', route: '/employees', roles: ['hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'], enabled: true },
    { key: 'jobDescriptions', icon: 'FileText', accent: '#17a2b8', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'talent', tiles: [
    { key: 'recruitment', icon: 'UserPlus', accent: '#e5484d', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'onboarding', icon: 'LogIn', accent: '#7c5cdf', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'learning', icon: 'GraduationCap', accent: '#1f9d57', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'succession', icon: 'GitBranch', accent: '#f08a00', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'operations', tiles: [
    { key: 'attendance', icon: 'CalendarCheck', accent: '#3485E9', route: '/attendance', roles: ['hr_manager', 'hr_officer', 'line_manager'], enabled: true },
    { key: 'leave', icon: 'CalendarDays', accent: '#7c5cdf', route: '/leave', roles: ['hr_manager', 'hr_officer', 'line_manager', 'employee'], enabled: true },
  ]},
  { key: 'payBenefits', tiles: [
    { key: 'payroll', icon: 'Wallet', accent: '#1f9d57', roles: ['payroll_officer', 'hr_manager'], enabled: false },
    { key: 'welfare', icon: 'HeartHandshake', accent: '#e5484d', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'performanceCulture', tiles: [
    { key: 'performance', icon: 'TrendingUp', accent: '#17a2b8', roles: ['hr_manager', 'line_manager'], enabled: false },
    { key: 'relations', icon: 'Scale', accent: '#012158', roles: ['hr_manager', 'ir_officer'], enabled: false },
    { key: 'engagement', icon: 'MessagesSquare', accent: '#f08a00', route: '/engagement', roles: ['hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'ir_officer', 'employee', 'viewer'], enabled: true },
  ]},
  { key: 'selfService', icon: 'CircleUser', accent: '#3485E9', tiles: [
    { key: 'selfService', roles: ['all'], enabled: false },
  ]},
  { key: 'adminAnalytics', tiles: [
    { key: 'documents', icon: 'FolderOpen', accent: '#123a7e', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'analytics', icon: 'ChartColumn', accent: '#7c5cdf', roles: ['hr_manager'], enabled: false },
  ]},
];

export function visibleTiles(tiles, role) {
  return tiles.filter((t) => t.roles.includes('all') || role === 'super_admin' || t.roles.includes(role));
}
