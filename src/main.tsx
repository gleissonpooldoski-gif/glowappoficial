import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Detect stale chunks after a redeploy (chunk hashes changed on the CDN
// while the tab was open). Offer the user a one-click reload instead of
// crashing with "Failed to fetch dynamically imported module".
const isChunkLoadError = (msg: unknown) => {
  const s = String(msg ?? "");
  return (
    s.includes("Failed to fetch dynamically imported module") ||
    s.includes("Importing a module script failed") ||
    s.includes("error loading dynamically imported module")
  );
};

const promptReload = () => {
  if ((window as any).__reloadPrompted) return;
  (window as any).__reloadPrompted = true;
  // Small async import so sonner is available; fall back to confirm().
  import("sonner")
    .then(({ toast }) => {
      toast.error("O app foi atualizado. Recarregue para continuar.", {
        duration: Infinity,
        action: { label: "Recarregar", onClick: () => window.location.reload() },
      });
    })
    .catch(() => {
      if (confirm("O app foi atualizado. Recarregar agora?")) window.location.reload();
    });
};

window.addEventListener("error", (e) => {
  if (isChunkLoadError(e.message)) promptReload();
});
window.addEventListener("unhandledrejection", (e) => {
  if (isChunkLoadError((e.reason as any)?.message ?? e.reason)) promptReload();
});

createRoot(document.getElementById("root")!).render(<App />);
