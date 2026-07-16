import { Instagram } from "lucide-react";

// TikTok icon (Lucide doesn't have a TikTok icon; simple SVG)
export function TiktokIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M19.321 5.562a5.124 5.124 0 0 1-3.036-1.088 5.128 5.128 0 0 1-2.087-3.352V1H10.9v13.417a3.086 3.086 0 0 1-3.086 3.086 3.086 3.086 0 0 1 0-6.172c.315 0 .618.048.903.137V8.115a6.363 6.363 0 0 0-.903-.065c-3.507 0-6.351 2.844-6.351 6.351S4.307 20.752 7.814 20.752s6.351-2.844 6.351-6.351V9.093a8.375 8.375 0 0 0 5.156 1.766V7.594a5.104 5.104 0 0 1 0 0z"
        fill="currentColor"
      />
    </svg>
  );
}

export function NetworkIcon({ network, className }: { network: "instagram" | "tiktok"; className?: string }) {
  if (network === "instagram") return <Instagram className={className} />;
  return <TiktokIcon className={className} />;
}
