import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.vercel.sh",
      },
    ],
    dangerouslyAllowSVG: true,
  },
  serverExternalPackages: ["@vercel/sandbox"],
};

export default withWorkflow(nextConfig);
