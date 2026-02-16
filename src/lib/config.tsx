import { Icons } from "@/components/icons";
import {
  BrainIcon,
  CodeIcon,
  GlobeIcon,
  PlugIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";

export const BLUR_FADE_DELAY = 0.15;

export const siteConfig = {
  name: "Vdesk",
  description:
    "A browser desktop for user-owned Vercel Sandbox workspaces with built-in tools and streamed Linux GUI apps.",
  cta: "Get Started",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  keywords: [
    "Vdesk",
    "Vercel Sandbox",
    "Browser Desktop",
    "Workspace VM",
    "Xpra Streaming",
    "code-server",
  ],
  links: {
    email: "montekkundan@gmail.com",
    twitter: "https://x.com/montekkundan",
    github: "https://github.com/Montekkundan/vdex",
  },
  hero: {
    title: "Vdesk",
    description:
      "Run a full browser desktop on top of your Vercel Sandbox: manage files, open terminals, use code-server, and stream Linux GUI apps.",
    cta: "Get Started",
    ctaDescription: "Sign in with Vercel to launch your desktop workspace",
  },
  features: [
    {
      name: "Simple Agent Workflows",
      description:
        "Easily create and manage AI agent workflows with intuitive APIs.",
      icon: <BrainIcon className="h-6 w-6" />,
    },
    {
      name: "Multi-Agent Systems",
      description:
        "Build complex systems with multiple AI agents working together.",
      icon: <UsersIcon className="h-6 w-6" />,
    },
    {
      name: "Tool Integration",
      description:
        "Seamlessly integrate external tools and APIs into your agent workflows.",
      icon: <PlugIcon className="h-6 w-6" />,
    },
    {
      name: "Cross-Language Support",
      description:
        "Available in all major programming languages for maximum flexibility.",
      icon: <GlobeIcon className="h-6 w-6" />,
    },
    {
      name: "Customizable Agents",
      description:
        "Design and customize agents to fit your specific use case and requirements.",
      icon: <CodeIcon className="h-6 w-6" />,
    },
    {
      name: "Efficient Execution",
      description:
        "Optimize agent performance with built-in efficiency and scalability features.",
      icon: <ZapIcon className="h-6 w-6" />,
    },
  ],
  footer: {
    socialLinks: [
      {
        icon: <Icons.github className="h-5 w-5" />,
        url: "https://github.com/Montekkundan/vdex",
      },
      {
        icon: <Icons.twitter className="h-5 w-5" />,
        url: "https://x.com/montekkundan",
      },
    ],
    brandText: "VDESK",
  },
};

export type SiteConfig = typeof siteConfig;
