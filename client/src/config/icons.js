import {
  ClipboardList, Users, FileText, UserPlus, LogIn, GraduationCap, GitBranch,
  CalendarCheck, CalendarDays, Wallet, HeartHandshake, TrendingUp, Scale,
  MessagesSquare, CircleUser, FolderOpen, ChartColumn, Square, LayoutGrid, LogOut, Menu, Search, ChevronLeft,
} from 'lucide-react';
export const ICONS = {
  ClipboardList, Users, FileText, UserPlus, LogIn, GraduationCap, GitBranch,
  CalendarCheck, CalendarDays, Wallet, HeartHandshake, TrendingUp, Scale,
  MessagesSquare, CircleUser, FolderOpen, ChartColumn, Square, LayoutGrid, LogOut, Menu, Search, ChevronLeft,
};
export function getIcon(name) { return ICONS[name] || Square; }
