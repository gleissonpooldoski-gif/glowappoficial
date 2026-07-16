import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import VideoLibrary from "./pages/VideoLibrary";
import Templates from "./pages/Templates";
import Brand from "./pages/Brand";
import Processing from "./pages/Processing";
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/videos" element={<VideoLibrary />} />
            <Route path="/templates" element={<Templates />} />
            
            <Route path="/brand" element={<Brand />} />
            <Route path="/processing" element={<Processing />} />
            <Route path="/finished" element={<Finished />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/edits" element={<MyEdits />} />
            <Route path="/editor/:id" element={<Editor />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
