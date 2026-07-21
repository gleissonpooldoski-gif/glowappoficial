import {
  Info, Database, Cog, Link2, HardDrive, ShieldCheck, UserCheck, Cookie, Mail,
} from "lucide-react";
import LegalLayout, { BulletList } from "@/components/LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      seoTitle="Privacy Policy | Viral Factory"
      seoDescription="Privacy Policy for Viral Factory."
      title="Privacy Policy"
      subtitle="Last updated: July 2026"
      intro="Viral Factory respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store and protect your information when you use our platform."
      sections={[
        {
          title: "Introduction",
          icon: <Info size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Welcome to Viral Factory.</p>
              <p className="mt-2">Viral Factory respects your privacy and is committed to protecting your personal information.</p>
              <p className="mt-2">This Privacy Policy explains how we collect, use, store and protect your information when you use our platform.</p>
            </>
          ),
        },
        {
          title: "Information We Collect",
          icon: <Database size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>We may collect:</p>
              <BulletList items={[
                "Full Name","Email Address","Profile Picture","Login Information",
                "Authentication Tokens","Connected Social Media Accounts","Uploaded Videos",
                "Uploaded Images","Generated Subtitles","AI Generated Captions","Templates",
                "Hashtags","Device Information","Browser Information","IP Address","Usage Analytics",
              ]} />
            </>
          ),
        },
        {
          title: "How We Use Your Information",
          icon: <Cog size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>We use collected information to:</p>
              <BulletList items={[
                "Authenticate users","Manage user accounts","Create videos","Edit videos",
                "Generate subtitles","Generate captions","Schedule publications",
                "Publish content to connected social media accounts",
                "Improve Artificial Intelligence features","Improve platform performance",
                "Customer support","Security monitoring","Fraud prevention","Analytics",
              ]} />
            </>
          ),
        },
        {
          title: "Third-Party Services",
          icon: <Link2 size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Viral Factory integrates with trusted third-party services including:</p>
              <BulletList items={["TikTok","Instagram","Meta","YouTube","Google","Supabase","OpenAI"]} />
              <p className="mt-3">Each service has its own Privacy Policy. Users should review those policies individually.</p>
            </>
          ),
        },
        {
          title: "Data Storage",
          icon: <HardDrive size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Uploaded videos, images and user information are securely stored using cloud infrastructure.</p>
              <p className="mt-2">We use industry-standard practices for storage, encryption and access control.</p>
            </>
          ),
        },
        {
          title: "Data Security",
          icon: <ShieldCheck size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>We protect user information using:</p>
              <BulletList items={["HTTPS","Encryption","Secure Authentication","Access Control","Cloud Security","Token Authentication"]} />
            </>
          ),
        },
        {
          title: "User Rights",
          icon: <UserCheck size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>Users may:</p>
              <BulletList items={[
                "Access their personal data","Update account information",
                "Disconnect connected social media accounts","Delete uploaded videos",
                "Delete uploaded images","Request account deletion",
                "Request permanent removal of stored information",
              ]} />
            </>
          ),
        },
        {
          title: "Cookies",
          icon: <Cookie size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>We may use cookies to:</p>
              <BulletList items={["Authentication","Save user preferences","Improve user experience","Analytics","Performance Monitoring"]} />
            </>
          ),
        },
        {
          title: "Contact",
          icon: <Mail size={16} strokeWidth={2.2} />,
          content: (
            <>
              <p>If you have questions regarding this Privacy Policy please contact us:</p>
              <a href="mailto:support@viralfactory.app" className="mt-2 inline-block text-gold hover:underline">
                support@viralfactory.app
              </a>
            </>
          ),
        },
      ]}
    />
  );
}
