import React, { createContext, useContext, useState, useCallback } from "react";
import { isAccountActive } from "@/lib/accountStore";
import { sendOtpEmail } from "@/lib/emailjs";


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
  verify: (code: string) => Promise<User>;
  forgotPassword: (email: string) => Promise<void>;
  verifyResetCode: (code: string) => Promise<void>;
  resetPassword: (code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEFAULT_USERS: (User & { password: string })[] = [
  { id: "1", email: "admin@admin.com", name: "Dr. Sarah Chen", role: "admin", verified: true, password: "admin123" },
  { id: "2", email: "user@user.com", name: "John Smith", role: "patient", verified: true, password: "user123" },
  { id: "3", email: "super@admin.com", name: "Super Administrator", role: "superadmin", verified: true, password: "super123" },
  { id: "4", email: "dentist@ayagdental.com", name: "Dr. Mike Johnson", role: "dentist", verified: true, password: "dentist123" },
];

const STORAGE_KEY = "ayag_auth_user";
const USERS_STORAGE_KEY = "ayag_mock_users";

function loadUsers(): (User & { password: string })[] {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

function saveUsers(users: (User & { password: string })[]) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {}
}

const MOCK_USERS: (User & { password: string })[] = loadUsers();

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
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [pendingResetEmail, setPendingResetEmail] = useState<string | null>(null);
  const [pendingResetCode, setPendingResetCode] = useState<string | null>(null);

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
    if (!found) {
      setIsLoading(false);
      throw new Error("Invalid email or password");
    }
    if (found.role === "patient" && !isAccountActive(found.email)) {
      setIsLoading(false);
      throw new Error("Your account has been deactivated. Please contact the clinic administrator.");
    }
    const { password: _, ...userData } = found;

    if (!userData.verified) {
      setPendingUser(userData);
      setIsLoading(false);
      throw new Error("VERIFY_REQUIRED");
    }
    setUser(userData);
    setIsLoading(false);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role: UserRole) => {
    setIsLoading(true);
    if (MOCK_USERS.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      setIsLoading(false);
      throw new Error("An account with this email already exists");
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await sendOtpEmail(email, code);
    } catch {
      setIsLoading(false);
      throw new Error("Failed to send verification email. Please try again.");
    }
    const newUser: User = { id: Date.now().toString(), email, name, role, verified: false };
    setPendingUser(newUser);
    setPendingCode(code);
    setPendingPassword(password);
    setIsLoading(false);
  }, []);

  const verify = useCallback(async (code: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 600));
    if (code !== pendingCode) {
      setIsLoading(false);
      throw new Error("Invalid verification code");
    }
    if (!pendingUser) {
      setIsLoading(false);
      throw new Error("No pending account to verify");
    }
    const verifiedUser = { ...pendingUser, verified: true };
    MOCK_USERS.push({ ...verifiedUser, password: pendingPassword ?? "" });
    saveUsers(MOCK_USERS);
    setUser(verifiedUser);
    setPendingUser(null);
    setPendingCode(null);
    setPendingPassword(null);
    setIsLoading(false);
    return verifiedUser;
  }, [pendingUser, pendingCode, pendingPassword]);

  const logout = useCallback(() => {
    setUser(null);
    setPendingUser(null);
    setPendingCode(null);
    setPendingPassword(null);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    setIsLoading(true);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
      await sendOtpEmail(email, code);
    } catch {
      setIsLoading(false);
      throw new Error("Failed to send reset code. Please try again.");
    }
    setPendingResetEmail(email);
    setPendingResetCode(code);
    setIsLoading(false);
  }, []);

  const verifyResetCode = useCallback(async (code: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 600));
    if (code !== pendingResetCode) {
      setIsLoading(false);
      throw new Error("Invalid reset code");
    }
    setIsLoading(false);
  }, [pendingResetCode]);

  const resetPassword = useCallback(async (code: string, newPassword: string) => {
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 600));
    if (code !== pendingResetCode) {
      setIsLoading(false);
      throw new Error("Invalid reset code");
    }
    const found = MOCK_USERS.find(u => u.email === pendingResetEmail);
    if (!found) {
      setIsLoading(false);
      throw new Error("No account found for this email");
    }
    found.password = newPassword;
    saveUsers(MOCK_USERS);
    setPendingResetEmail(null);
    setPendingResetCode(null);
    setIsLoading(false);
  }, [pendingResetEmail, pendingResetCode]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, verify, forgotPassword, verifyResetCode, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getPatientAccounts(): User[] {
  return loadUsers()
    .filter(u => u.role === "patient")
    .map(({ password, ...rest }) => rest);
}

export function emailExists(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return loadUsers().some(u => u.email.toLowerCase() === normalized);
}
