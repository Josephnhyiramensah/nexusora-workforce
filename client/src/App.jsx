import { Routes, Route, Navigate } from 'react-router-dom';
import { CurrencyProvider } from './context/CurrencyContext';
import BrandStyle from './context/BrandStyle';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomeScreen from './pages/HomeScreen';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeProfilePage from './pages/EmployeeProfilePage';
import AttendancePage from './pages/AttendancePage';
import LeavePage from './pages/LeavePage';
import PayrollPage from './pages/PayrollPage';
import CompliancePage from './pages/CompliancePage';
import SettingsPage from './pages/SettingsPage';
import OrganizationPage from './pages/OrganizationPage';
import PositionsPage from './pages/PositionsPage';
import JobDescriptionsPage from './pages/JobDescriptionsPage';
import SelfServicePage from './pages/SelfServicePage';
import RecruitmentPage from './pages/RecruitmentPage';
import OnboardingPage from './pages/OnboardingPage';
import PerformancePage from './pages/PerformancePage';
import AnalyticsPage from './pages/AnalyticsPage';
import DocumentsPage from './pages/DocumentsPage';
import WorkforcePlanningPage from './pages/WorkforcePlanningPage';
import LearningPage from './pages/LearningPage';
import SuccessionPage from './pages/SuccessionPage';
import EmployeeRelationsPage from './pages/EmployeeRelationsPage';
import AIAdvisorPage from './pages/AIAdvisorPage';
import WelfareSocialPage from './pages/WelfareSocialPage';
export default function App() {
  return (
    <CurrencyProvider>
      <BrandStyle />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><HomeScreen /></ProtectedRoute>} />
      <Route path="/employees" element={<ProtectedRoute><AppShell><EmployeesPage /></AppShell></ProtectedRoute>} />
      <Route path="/employees/:id" element={<ProtectedRoute><AppShell><EmployeeProfilePage /></AppShell></ProtectedRoute>} />
      <Route path="/organization" element={<ProtectedRoute><AppShell><OrganizationPage /></AppShell></ProtectedRoute>} />
      <Route path="/positions" element={<ProtectedRoute><AppShell><PositionsPage /></AppShell></ProtectedRoute>} />
      <Route path="/job-descriptions" element={<ProtectedRoute><AppShell><JobDescriptionsPage /></AppShell></ProtectedRoute>} />
      <Route path="/recruitment" element={<ProtectedRoute><AppShell><RecruitmentPage /></AppShell></ProtectedRoute>} />
      <Route path="/self-service" element={<ProtectedRoute><AppShell><SelfServicePage /></AppShell></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><AppShell><AttendancePage /></AppShell></ProtectedRoute>} />
      <Route path="/leave" element={<ProtectedRoute><AppShell><LeavePage /></AppShell></ProtectedRoute>} />
      <Route path="/payroll" element={<ProtectedRoute><AppShell><PayrollPage /></AppShell></ProtectedRoute>} />
      <Route path="/compliance" element={<ProtectedRoute><AppShell><CompliancePage /></AppShell></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppShell><SettingsPage /></AppShell></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><AppShell><OnboardingPage /></AppShell></ProtectedRoute>} />
      <Route path="/performance" element={<ProtectedRoute><AppShell><PerformancePage /></AppShell></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AppShell><AnalyticsPage /></AppShell></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><AppShell><DocumentsPage /></AppShell></ProtectedRoute>} />
      <Route path="/workforce-planning" element={<ProtectedRoute><AppShell><WorkforcePlanningPage /></AppShell></ProtectedRoute>} />
      <Route path="/learning" element={<ProtectedRoute><AppShell><LearningPage /></AppShell></ProtectedRoute>} />
      <Route path="/succession" element={<ProtectedRoute><AppShell><SuccessionPage /></AppShell></ProtectedRoute>} />
      <Route path="/relations" element={<ProtectedRoute><AppShell><EmployeeRelationsPage /></AppShell></ProtectedRoute>} />
      <Route path="/ai-advisor" element={<ProtectedRoute><AppShell><AIAdvisorPage /></AppShell></ProtectedRoute>} />
      <Route path="/welfare" element={<ProtectedRoute><AppShell><WelfareSocialPage /></AppShell></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CurrencyProvider>
  );
}