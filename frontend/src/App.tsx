import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { RequireAdmin, RequireAuth } from "./components/layout/RequireAuth";
import Chat from "./pages/Chat";
import Documents from "./pages/Documents";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Security from "./pages/Security";
import SignIn from "./pages/SignIn";
import Simulator from "./pages/Simulator";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="ask" replace />} />
        <Route path="ask" element={<Chat />} />
        <Route path="documents" element={<Documents />} />
        <Route path="simulator" element={<RequireAdmin><Simulator /></RequireAdmin>} />
        <Route path="security" element={<RequireAdmin><Security /></RequireAdmin>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
