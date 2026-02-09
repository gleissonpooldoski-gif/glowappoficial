import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { SkinType, SkinGoal } from "@/data/routines";

export interface User {
  id: string;
  email: string;
  name: string;
  skinType?: SkinType;
  goal?: SkinGoal;
  onboardingComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("glowapp_user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const saveUser = (u: User) => {
    setUser(u);
    localStorage.setItem("glowapp_user", JSON.stringify(u));
  };

  const login = async (email: string, _password: string) => {
    const stored = localStorage.getItem("glowapp_users");
    const users: Record<string, User & { password: string }> = stored ? JSON.parse(stored) : {};
    const found = Object.values(users).find((u) => u.email === email);
    if (!found) throw new Error("Usuário não encontrado");
    const { password: _p, ...userData } = found;
    saveUser(userData);
  };

  const register = async (name: string, email: string, password: string) => {
    const stored = localStorage.getItem("glowapp_users");
    const users: Record<string, any> = stored ? JSON.parse(stored) : {};
    if (Object.values(users).some((u: any) => u.email === email)) {
      throw new Error("E-mail já cadastrado");
    }
    const id = crypto.randomUUID();
    const newUser: User = { id, email, name, onboardingComplete: false };
    users[id] = { ...newUser, password };
    localStorage.setItem("glowapp_users", JSON.stringify(users));
    saveUser(newUser);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("glowapp_user");
  };

  const updateProfile = (data: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...data };
    saveUser(updated);
    // Also update in users store
    const stored = localStorage.getItem("glowapp_users");
    if (stored) {
      const users = JSON.parse(stored);
      if (users[user.id]) {
        users[user.id] = { ...users[user.id], ...data };
        localStorage.setItem("glowapp_users", JSON.stringify(users));
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
