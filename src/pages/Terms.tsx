import {
  CheckCircle2, Sparkles, UserCog, Share2, ShieldAlert, Copyright,
  AlertTriangle, Wrench, Ban, RefreshCw, Mail,
} from "lucide-react";
import LegalLayout, { BulletList } from "@/components/LegalLayout";

export default function Terms() {
  return (
    <LegalLayout
      seoTitle="Terms of Service | Viral Factory"
      seoDescription="Terms of Service for Viral Factory."
      title="Terms of Service"
      subtitle="Last updated: July 2026"
      intro="By accessing or using Viral Factory you agree to comply with these Terms of Service. If you do not agree with these Terms you should not use the platform."
      sections={[
        {
          title: "Acceptance of Terms",
          icon: <CheckCircle2 size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>By accessing or using Viral Factory you agree to comply with these Terms of Service.</p>
              <p className="mt-2">If you do not agree with these Terms you should not use the platform.</p>
            </>
          ),
        },
        {
          title: "Services",
          icon: <Sparkles size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Viral Factory provides:</p>
              <BulletList items={[
                "AI Video Creation","AI Video Editing","Subtitle Generation","Caption Generation",
                "Templates","Video Library","Scheduling","Social Media Publishing",
                "Content Management","Artificial Intelligence Automation",
              ]} />
            </>
          ),
        },
        {
          title: "User Accounts",
          icon: <UserCog size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Users are responsible for:</p>
              <BulletList items={["Maintaining account security","Protecting passwords","Keeping login credentials confidential"]} />
            </>
          ),
        },
        {
          title: "Connected Social Media Accounts",
          icon: <Share2 size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Users authorize Viral Factory to access connected social media accounts solely to perform requested actions such as:</p>
              <BulletList items={["Upload videos","Publish content","Schedule publications","Manage connected accounts"]} />
              <p className="mt-3">We never publish content without explicit user authorization.</p>
            </>
          ),
        },
        {
          title: "User Responsibilities",
          icon: <ShieldAlert size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Users agree NOT to:</p>
              <BulletList items={[
                "Upload illegal content","Upload copyrighted material without permission",
                "Publish spam","Attempt unauthorized access","Abuse the platform","Distribute malware",
              ]} />
            </>
          ),
        },
        {
          title: "Intellectual Property",
          icon: <Copyright size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Users retain ownership of all uploaded content.</p>
              <p className="mt-2">Viral Factory retains ownership of:</p>
              <BulletList items={["Platform","Source Code","Brand","Logo","Interface","Design","Artificial Intelligence Features"]} />
            </>
          ),
        },
        {
          title: "Limitation of Liability",
          icon: <AlertTriangle size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Viral Factory is not responsible for interruptions, outages or failures caused by third-party services including:</p>
              <BulletList items={["TikTok","Instagram","Meta","YouTube","Google"]} />
            </>
          ),
        },
        {
          title: "Service Availability",
          icon: <Wrench size={16} strokeWidth={2.2} />,
          content: (
            <p>Services may be modified, updated or temporarily unavailable for maintenance without prior notice.</p>
          ),
        },
        {
          title: "Account Termination",
          icon: <Ban size={16} strokeWidth={2.2} />,
          content: (
            <p>Accounts violating these Terms may be suspended or permanently removed.</p>
          ),
        },
        {
          title: "Changes to Terms",
          icon: <RefreshCw size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>These Terms may be updated periodically.</p>
              <p className="mt-2">Continued use of Viral Factory after updates constitutes acceptance of the revised Terms.</p>
            </>
          ),
        },
        {
          title: "Contact",
          icon: <Mail size={16} strokeWidth={2.2} />,
          content: (
            <a href="mailto:support@viralfactory.app" className="text-gold hover:underline">
              support@viralfactory.app
            </a>
          ),
        },
      ]}
    />
  );
}
