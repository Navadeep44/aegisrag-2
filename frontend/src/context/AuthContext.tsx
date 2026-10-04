import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, hasToken, setToken } from "../lib/api";
import type { Session, User } from "../lib/types";

type Auth = { user: User | null; ready: boolean; signIn: (session: Session) => void; signOut: () => void };

const AuthContext = createContext<Auth>({ user: null, ready: false, signIn: () => {}, signOut: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!hasToken());

  useEffect(() => {
    if (hasToken()) {
      api<User>("/users/me").then(setUser).catch(() => setToken("")).finally(() => setReady(true));
    }
    const onSignedOut = () => setUser(null);
    window.addEventListener("aegis-signed-out", onSignedOut);
    return () => window.removeEventListener("aegis-signed-out", onSignedOut);
  }, []);

  const signIn = (session: Session) => { setToken(session.token); setUser(session.user); };
  const signOut = () => { setToken(""); setUser(null); };

  return <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
