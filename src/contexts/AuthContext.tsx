import React, { createContext, useContext, useState, useCallback } from "react";

export type UserRole = "admin" | "patient" | "superadmin" | "dentist";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  verified: boolean;
  employeeId?: string | null;
}

export interface RegisterPatientInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  birthdate: string;
  sex: string;
  address: string;
  contactNumber: string;
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterPatientInput) => Promise<void>;
  logout: () => void;
  verify: (code: string) => Promise<User>;
  /** The email a sign-up code was sent to, while one is waiting to be entered. */
  pendingEmail: string | null;
  forgotPassword: (email: string) => Promise<void>;
  verifyResetCode: (code: string) => Promise<void>;
  resetPassword: (code: string, newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "ayag_auth_token";
const USER_KEY = "ayag_auth_user";
const PENDING_EMAIL_KEY = "ayag_pending_verify_email";

/** A request the server refused, carrying whatever it said besides the message —
 * a 409 often explains what is in the way, not just that something is. */
export class ApiError extends Error {
  constructor(message: string, readonly data: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong. Please try again.", data);
  return data as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  // Kept for the tab, not just in memory: on a phone you leave for the mail app to read the
  // code, and the browser often reloads the page when you come back. Without this the
  // email would be forgotten and the code couldn't be entered.
  const [pendingEmail, setPendingEmailState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(PENDING_EMAIL_KEY);
    } catch {
      return null;
    }
  });
  const setPendingEmail = useCallback((email: string | null) => {
    try {
      if (email) sessionStorage.setItem(PENDING_EMAIL_KEY, email);
      else sessionStorage.removeItem(PENDING_EMAIL_KEY);
    } catch {}
    setPendingEmailState(email);
  }, []);
  const [pendingResetEmail, setPendingResetEmail] = useState<string | null>(null);

  const setSession = useCallback((token: string, u: User) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {}
    setUserState(u);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { token, user: u } = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(token, u);
    } finally {
      setIsLoading(false);
    }
  }, [setSession]);

  const register = useCallback(async (input: RegisterPatientInput) => {
    setIsLoading(true);
    try {
      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...input, role: "patient" }),
      });
      setPendingEmail(input.email);
    } finally {
      setIsLoading(false);
    }
  }, [setPendingEmail]);

  const verify = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      if (!pendingEmail) throw new Error("No pending account to verify");
      const { token, user: u } = await api<{ token: string; user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: pendingEmail, code }),
      });
      setSession(token, u);
      setPendingEmail(null);
      return u;
    } finally {
      setIsLoading(false);
    }
  }, [pendingEmail, setSession, setPendingEmail]);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
    setUserState(null);
    setPendingEmail(null);
  }, [setPendingEmail]);

  const forgotPassword = useCallback(async (email: string) => {
    setIsLoading(true);
    try {
      await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setPendingResetEmail(email);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyResetCode = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      if (!pendingResetEmail) throw new Error("No pending reset request");
      await api("/auth/verify-reset-code", {
        method: "POST",
        body: JSON.stringify({ email: pendingResetEmail, code }),
      });
    } finally {
      setIsLoading(false);
    }
  }, [pendingResetEmail]);

  const resetPassword = useCallback(async (code: string, newPassword: string) => {
    setIsLoading(true);
    try {
      if (!pendingResetEmail) throw new Error("No pending reset request");
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email: pendingResetEmail, code, newPassword }),
      });
      setPendingResetEmail(null);
    } finally {
      setIsLoading(false);
    }
  }, [pendingResetEmail]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setIsLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, verify, pendingEmail, forgotPassword, verifyResetCode, resetPassword, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export async function getPatientAccounts(): Promise<User[]> {
  try {
    const data = await api<{ patients: User[] }>("/patients");
    return data.patients;
  } catch {
    return [];
  }
}

export async function emailExists(email: string): Promise<boolean> {
  const res = await fetch(`/api/users/email-exists?email=${encodeURIComponent(email.trim().toLowerCase())}`);
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.exists);
}
