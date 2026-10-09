// Registers ALL per-tenant models on a given tenant connection. Idempotent.
function registerAllModels(conn) {
  const defs = [
    require('./tenant/User'),
    require('./tenant/CompliancePack'),
    require('./tenant/Employee'),
    require('./tenant/EmployeeChange'),
    require('./tenant/OrgUnit'),
    require('./tenant/Position'),
    require('./tenant/Picklist'),
    require('./tenant/Attendance'),
    require('./tenant/LeaveType'),
    require('./tenant/LeaveRequest'),
    require('./tenant/PayrollRun'),
    require('./tenant/Vacancy'),
    require('./tenant/Application'),
    require('./tenant/Onboarding'),
    require('./tenant/OnboardingTemplate'),
    require('./tenant/AppraisalCycle'),
    require('./tenant/Review'),
    require('./tenant/CompanyDocument'),
    require('./tenant/WorkforcePlan'),
    require('./tenant/Course'),
    require('./tenant/CourseEnrollment'),
    require('./tenant/Competency'),
    require('./tenant/CompetencyRating'),
    require('./tenant/TrainingPlan'),
    require('./tenant/Certification'),
    require('./tenant/TalentProfile'),
    require('./tenant/SuccessionPlan'),
    require('./tenant/DevelopmentPlan'),
    require('./tenant/ERCase'),
    require('./tenant/StaffLoan'),
    require('./tenant/WelfareClaim'),
    require('./tenant/WelfareScheme'),
    require('./tenant/Survey'),
    require('./tenant/SurveyResponse'),
    require('./tenant/Notification'),
    require('./tenant/ExchangeRate'),
    require('./tenant/ApiKey'),
  ];
  for (const def of defs) {
    if (!conn.models[def.modelName]) conn.model(def.modelName, def.schema);
  }
  return conn;
}
module.exports = { registerAllModels };