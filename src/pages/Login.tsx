import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import authHero from "@/assets/auth-hero.jpg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative h-48 w-full overflow-hidden">
        <img src={authHero} alt="Skincare products" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>
      <div className="flex flex-1 flex-col items-center px-6 pb-8">
        <h1 className="mt-4 text-3xl font-bold glow-text">GlowApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">Skincare simples, claro e que funciona.</p>

        <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full glow-shadow" size="lg" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">Esqueci minha senha</Link>
          <span className="text-muted-foreground">
            Não tem conta?{" "}
            <Link to="/register" className="text-primary font-medium hover:underline">Cadastre-se</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
