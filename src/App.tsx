import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import VideoLibrary from "./pages/VideoLibrary";
import Templates from "./pages/Templates";
import Finished from "./pages/Finished";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Editor from "./pages/Editor";
import MyEdits from "./pages/MyEdits";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/videos" replace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/videos" element={<VideoLibrary />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/finished" element={<Finished />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/edits" element={<MyEdits />} />
            <Route path="/editor/:id" element={<Editor />} />
            {/* Módulos legados removidos: redireciona para Vídeos Prontos */}
            <Route path="/brand" element={<Navigate to="/videos" replace />} />
            <Route path="/processing" element={<Navigate to="/finished" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
