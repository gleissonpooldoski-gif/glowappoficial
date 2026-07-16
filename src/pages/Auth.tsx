import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function Auth() {
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handle = async (mode: "in" | "up") => {
    if (!email || !password) return;
    setLoading(true);
    const { error } = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else if (mode === "up") {
      toast.success("Conta criada! Verifique seu e-mail se necessário.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 justify-center">
          <div className="h-7 w-7 rounded-md bg-primary" />
          <span className="text-lg font-semibold tracking-tight">ContentFlow</span>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Bem-vindo</CardTitle>
            <CardDescription>Acesse seu painel privado de conteúdo</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="e1">E-mail</Label>
                  <Input id="e1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p1">Senha</Label>
                  <Input id="p1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button className="w-full" onClick={() => handle("in")} disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="e2">E-mail</Label>
                  <Input id="e2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p2">Senha</Label>
                  <Input id="p2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </div>
                <Button className="w-full" onClick={() => handle("up")} disabled={loading}>
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
