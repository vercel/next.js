import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "drupal.ddev.site",
      },
    ],
  },
};

export default nextConfig;
