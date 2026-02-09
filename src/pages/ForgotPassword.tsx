import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-6 pt-12">
      <Link to="/login" className="mb-8 flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Voltar
      </Link>

      <h1 className="text-2xl font-bold">Recuperar Senha</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Digite seu e-mail e enviaremos instruções para redefinir sua senha.
      </p>

      {sent ? (
        <div className="mt-8 w-full max-w-sm rounded-xl bg-card p-6 text-center glow-shadow">
          <p className="text-4xl">📧</p>
          <p className="mt-4 font-medium">E-mail enviado!</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
          </p>
          <Link to="/login">
            <Button className="mt-6 w-full" variant="outline">Voltar ao login</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
          </div>
          <Button type="submit" className="w-full glow-shadow" size="lg">Enviar</Button>
        </form>
      )}
    </div>
  );
}
