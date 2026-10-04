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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="ask" replace />} />
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
