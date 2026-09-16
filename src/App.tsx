import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Verify from "./pages/Verify";
import ForgotPassword from "./pages/ForgotPassword";

import DashboardLayout from "./components/DashboardLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPatients from "./pages/admin/AdminPatients";
import AdminPatientHistory from "./pages/admin/AdminPatientHistory";
import AdminAppointments from "./pages/admin/AdminAppointments";
import AdminQueue from "./pages/admin/AdminQueue";
import AdminInventory from "./pages/admin/AdminInventory";
import AdminSales from "./pages/admin/AdminSales";
import AdminReports from "./pages/admin/AdminReports";
import AdminTreatment from "./pages/admin/AdminTreatment";
import AdminAccounts from "./pages/admin/AdminAccounts";
import AdminOnlineAppointments from "./pages/admin/AdminOnlineAppointments";

import PatientDashboard from "./pages/patient/PatientDashboard";
import PatientBook from "./pages/patient/PatientBook";
import PatientAppointments from "./pages/patient/PatientAppointments";
import PatientQueue from "./pages/patient/PatientQueue";
import PatientRecords from "./pages/patient/PatientRecords";

import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import SuperAdminStaff from "./pages/superadmin/SuperAdminStaff";
import SuperAdminAddStaff from "./pages/superadmin/SuperAdminAddStaff";
import SuperAdminArchives from "./pages/superadmin/SuperAdminArchives";
import SuperAdminSettings from "./pages/superadmin/SuperAdminSettings";
import SuperAdminReports from "./pages/superadmin/SuperAdminReports";

import DentistDashboard from "./pages/dentist/DentistDashboard";
import DentistSchedule from "./pages/dentist/DentistSchedule";
import DentistAppointments from "./pages/dentist/DentistAppointments";
import DentistPatientHistory from "./pages/dentist/DentistPatientHistory";
import DentistRecords from "./pages/dentist/DentistRecords";
import DentistProfile from "./pages/dentist/DentistProfile";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function getRoleHome(role: string) {
  if (role === "superadmin") return "/superadmin";
  if (role === "admin") return "/admin";
  if (role === "dentist") return "/dentist";
  return "/patient";
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={getRoleHome(user.role)} replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user) return <Navigate to={getRoleHome(user.role)} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><Register /></AuthRoute>} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/forgot-password" element={<AuthRoute><ForgotPassword /></AuthRoute>} />

      {/* Admin / Staff Routes */}
      <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/patients" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminPatients /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/patients/:id" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminPatientHistory /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/accounts" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminAccounts /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/appointments" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminAppointments /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/online-appointments" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminOnlineAppointments /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/queue" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminQueue /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/treatment" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminTreatment /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/inventory" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminInventory /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/sales" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminSales /></DashboardLayout></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute roles={["admin"]}><DashboardLayout><AdminReports /></DashboardLayout></ProtectedRoute>} />

      {/* Patient Routes */}
      <Route path="/patient" element={<ProtectedRoute roles={["patient"]}><DashboardLayout><PatientDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/patient/book" element={<ProtectedRoute roles={["patient"]}><DashboardLayout><PatientBook /></DashboardLayout></ProtectedRoute>} />
      <Route path="/patient/appointments" element={<ProtectedRoute roles={["patient"]}><DashboardLayout><PatientAppointments /></DashboardLayout></ProtectedRoute>} />
      <Route path="/patient/queue" element={<ProtectedRoute roles={["patient"]}><DashboardLayout><PatientQueue /></DashboardLayout></ProtectedRoute>} />
      <Route path="/patient/records" element={<ProtectedRoute roles={["patient"]}><DashboardLayout><PatientRecords /></DashboardLayout></ProtectedRoute>} />

      {/* Super Admin Routes */}
      <Route path="/superadmin" element={<ProtectedRoute roles={["superadmin"]}><DashboardLayout><SuperAdminDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/superadmin/staff" element={<ProtectedRoute roles={["superadmin"]}><DashboardLayout><SuperAdminStaff /></DashboardLayout></ProtectedRoute>} />
      <Route path="/superadmin/staff/new" element={<ProtectedRoute roles={["superadmin"]}><DashboardLayout><SuperAdminAddStaff /></DashboardLayout></ProtectedRoute>} />
      <Route path="/superadmin/archives" element={<ProtectedRoute roles={["superadmin"]}><DashboardLayout><SuperAdminArchives /></DashboardLayout></ProtectedRoute>} />
      <Route path="/superadmin/settings" element={<ProtectedRoute roles={["superadmin"]}><DashboardLayout><SuperAdminSettings /></DashboardLayout></ProtectedRoute>} />
      <Route path="/superadmin/reports" element={<ProtectedRoute roles={["superadmin"]}><DashboardLayout><SuperAdminReports /></DashboardLayout></ProtectedRoute>} />

      {/* Dentist Routes */}
      <Route path="/dentist" element={<ProtectedRoute roles={["dentist"]}><DashboardLayout><DentistDashboard /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dentist/schedule" element={<ProtectedRoute roles={["dentist"]}><DashboardLayout><DentistSchedule /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dentist/appointments" element={<ProtectedRoute roles={["dentist"]}><DashboardLayout><DentistAppointments /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dentist/patient-history" element={<ProtectedRoute roles={["dentist"]}><DashboardLayout><DentistPatientHistory /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dentist/records" element={<ProtectedRoute roles={["dentist"]}><DashboardLayout><DentistRecords /></DashboardLayout></ProtectedRoute>} />
      <Route path="/dentist/profile" element={<ProtectedRoute roles={["dentist"]}><DashboardLayout><DentistProfile /></DashboardLayout></ProtectedRoute>} />


      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
