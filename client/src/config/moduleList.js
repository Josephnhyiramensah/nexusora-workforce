import { Users, Building2, Briefcase, FileText, IdCard, UserPlus, ClipboardCheck, CalendarClock, CalendarDays, Wallet, ShieldCheck, TrendingUp, GraduationCap, Network, HeartHandshake, Scale, BarChart3, Gauge, Sparkles, Settings, Smile } from 'lucide-react';
export const MODULE_GROUPS = [
  { title: 'People', titleKey: 'home.groups.people', items: [
    { key:'employees', label:'Employees', labelKey:'home.tile.employees', to:'/employees', Icon:Users, accent:'#3485E9', live:true },
    { key:'organization', label:'Organization', labelKey:'home.tile.organization', to:'/organization', Icon:Building2, accent:'#012158', live:true },
    { key:'positions', label:'Positions', labelKey:'home.tile.positions', to:'/positions', Icon:Briefcase, accent:'#0b6fd6', live:true },
    { key:'jd', label:'Job Descriptions', labelKey:'home.tile.jd', to:'/job-descriptions', Icon:FileText, accent:'#17a2b8', live:true },
    { key:'self', label:'Self-Service', labelKey:'home.tile.self', to:'/self-service', Icon:IdCard, accent:'#7c5cdf', live:true },
  ]},
  { title: 'Hire & Onboard', titleKey: 'home.groups.hire', items: [
    { key:'recruitment', label:'Recruitment', labelKey:'home.tile.recruitment', to:'/recruitment', Icon:UserPlus, accent:'#1f9d57', live:true },
    { key:'onboarding', label:'Onboarding', labelKey:'home.tile.onboarding', to:'/onboarding', Icon:ClipboardCheck, accent:'#168eff', live:true },
  ]},
  { title: 'Time & Pay', titleKey: 'home.groups.time', items: [
    { key:'attendance', label:'Attendance', labelKey:'home.tile.attendance', to:'/attendance', Icon:CalendarClock, accent:'#0b6fd6', live:true },
    { key:'leave', label:'Leave', labelKey:'home.tile.leave', to:'/leave', Icon:CalendarDays, accent:'#17a2b8', live:true },
    { key:'payroll', label:'Payroll', labelKey:'home.tile.payroll', to:'/payroll', Icon:Wallet, accent:'#1f9d57', live:true },
    { key:'compliance', label:'Compliance', labelKey:'home.tile.compliance', to:'/compliance', Icon:ShieldCheck, accent:'#c77700', live:true },
  ]},
  { title: 'Talent & Growth', titleKey: 'home.groups.talent', items: [
    { key:'performance', label:'Performance', labelKey:'home.tile.performance', to:'/performance', Icon:TrendingUp, accent:'#3485E9', live:true },
    { key:'learning', label:'Learning', labelKey:'home.tile.learning', to:'/learning', Icon:GraduationCap, accent:'#7c5cdf', live:true },
    { key:'succession', label:'Succession', labelKey:'home.tile.succession', to:'/succession', Icon:Network, accent:'#012158', live:true },
    { key:'engagement', label:'Engagement', labelKey:'home.tile.engagement', to:'/engagement', Icon:Smile, accent:'#e5484d', live:true },
  ]},
  { title: 'Care & Cases', titleKey: 'home.groups.care', items: [
    { key:'welfare', label:'Welfare & Social', labelKey:'home.tile.welfare', to:'/welfare', Icon:HeartHandshake, accent:'#1f9d57', live:true },
    { key:'relations', label:'Employee Relations', labelKey:'home.tile.relations', to:'/relations', Icon:Scale, accent:'#e5484d', live:true },
  ]},
  { title: 'Insight & Admin', titleKey: 'home.groups.insight', items: [
    { key:'analytics', label:'Analytics', labelKey:'home.tile.analytics', to:'/analytics', Icon:BarChart3, accent:'#168eff', live:true },
    { key:'documents', label:'Documents', labelKey:'home.tile.documents', to:'/documents', Icon:FileText, accent:'#0b6fd6', live:true },
    { key:'planning', label:'Workforce Planning', labelKey:'home.tile.planning', to:'/workforce-planning', Icon:Gauge, accent:'#17a2b8', live:true },
    { key:'ai', label:'Workforce Intelligence', labelKey:'home.tile.ai', to:'/ai-advisor', Icon:Sparkles, accent:'#7c5cdf', live:true },
    { key:'settings', label:'Settings', labelKey:'home.tile.settings', to:'/settings', Icon:Settings, accent:'#67728a', live:true },
  ]},
];