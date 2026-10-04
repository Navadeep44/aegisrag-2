import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAuth } from "./components/layout/RequireAuth";
import AccessRequests from "./pages/AccessRequests";
import Chat from "./pages/Chat";
import DepartmentInsights from "./pages/DepartmentInsights";
import Documents from "./pages/Documents";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import PlatformAdmin from "./pages/PlatformAdmin";
import Profile from "./pages/Profile";
import Security from "./pages/Security";
import SignIn from "./pages/SignIn";
import Simulator from "./pages/Simulator";
import TenantSettings from "./pages/TenantSettings";
import UsersAndRoles from "./pages/UsersAndRoles";

import { useAuth } from "./context/AuthContext";

function DefaultAppRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/signin" replace />;
  const roles = user.roles || [];
  if (user.is_platform_admin || roles.includes("platform_super_admin")) return <Navigate to="platform" replace />;
  if (roles.includes("security_auditor") && !roles.includes("admin")) return <Navigate to="security" replace />;
  if (roles.includes("document_manager") && !roles.includes("admin")) return <Navigate to="documents" replace />;
  if (roles.includes("iam_admin") && !roles.includes("admin")) return <Navigate to="users-and-roles" replace />;
  if (roles.includes("organization_owner") && !roles.includes("admin")) return <Navigate to="settings" replace />;
  if (roles.includes("department_manager") && !roles.includes("admin")) return <Navigate to="department-insights" replace />;
  if (roles.includes("team_lead") && !roles.includes("admin")) return <Navigate to="department-insights" replace />;
  return <Navigate to="ask" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DefaultAppRedirect />} />
        <Route path="ask" element={<Chat />} />
        <Route path="documents" element={<Documents />} />
        <Route path="users-and-roles" element={<UsersAndRoles />} />
        <Route path="department-insights" element={<DepartmentInsights />} />
        <Route path="access-requests" element={<AccessRequests />} />
        <Route path="simulator" element={<Simulator />} />
        <Route path="security" element={<Security />} />
        <Route path="settings" element={<TenantSettings />} />
        <Route path="platform" element={<PlatformAdmin />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
