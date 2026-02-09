import { useState, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import { getChatResponse } from "@/data/chatResponses";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
}

const welcomeMessage: Message = {
  id: "welcome",
  text: "Olá! 🌸 Sou a assistente do GlowApp! Posso te ajudar com dúvidas sobre skincare, rotinas e dicas para sua pele. Pergunte o que quiser!",
  sender: "bot",
};

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: crypto.randomUUID(), text: input.trim(), sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulate typing delay
    setTimeout(() => {
      const response = getChatResponse(userMsg.text);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), text: response, sender: "bot" }]);
    }, 600);
  };

  return (
    <Layout>
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Chat Educacional</h1>
        <p className="text-xs text-muted-foreground">Tire suas dúvidas sobre skincare</p>
      </header>

      <div className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-card p-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "glow-gradient text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Pergunte sobre skincare..."
            className="flex-1 rounded-2xl border border-input bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={handleSend} size="icon" className="h-12 w-12 shrink-0 rounded-2xl glow-shadow" disabled={!input.trim()}>
            <Send size={18} />
          </Button>
        </div>
      </div>
    </Layout>
  );
}
