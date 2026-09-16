import React, { createContext, useContext, useState, useCallback } from "react";
import { isAccountActive } from "@/lib/accountStore";


export type UserRole = "admin" | "patient" | "superadmin" | "dentist";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  verified: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  verify: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const MOCK_USERS: (User & { password: string })[] = [
  { id: "1", email: "admin@admin.com", name: "Dr. Sarah Chen", role: "admin", verified: true, password: "admin123" },
  { id: "2", email: "user@user.com", name: "John Smith", role: "patient", verified: true, password: "user123" },
  { id: "3", email: "super@admin.com", name: "Super Administrator", role: "superadmin", verified: true, password: "super123" },
  { id: "4", email: "dentist@ayagdental.com", name: "Dr. Mike Johnson", role: "dentist", verified: true, password: "dentist123" },
];

const STORAGE_KEY = "ayag_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    const found = MOCK_USERS.find(u => u.email === email && u.password === password);
    if (!found) throw new Error("Invalid email or password");
    if (found.role === "patient" && !isAccountActive(found.email)) {
      setIsLoading(false);
      throw new Error("Your account has been deactivated. Please contact the clinic administrator.");
    }
    const { password: _, ...userData } = found;

    if (!userData.verified) {
      setPendingUser(userData);
      throw new Error("VERIFY_REQUIRED");
    }
    setUser(userData);
    setIsLoading(false);
  }, []);

  const register = useCallback(async (name: string, email: string, _password: string, role: UserRole) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 800));
    if (MOCK_USERS.find(u => u.email === email)) throw new Error("Email already exists");
    const newUser: User = { id: Date.now().toString(), email, name, role, verified: false };
    setPendingUser(newUser);
    setIsLoading(false);
  }, []);

  const verify = useCallback(async (code: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 600));
    if (code !== "123456") throw new Error("Invalid verification code");
    if (pendingUser) {
      setUser({ ...pendingUser, verified: true });
      setPendingUser(null);
    }
    setIsLoading(false);
  }, [pendingUser]);

  const logout = useCallback(() => {
    setUser(null);
    setPendingUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, verify }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
