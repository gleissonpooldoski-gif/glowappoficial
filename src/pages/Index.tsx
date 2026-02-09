import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
    } else if (!user?.onboardingComplete) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
  }, [isAuthenticated, user, navigate]);

  return null;
};

export default Index;
