import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.flotiq.com",
        port: "",
        pathname: "/image/**",
      },
    ],
  },
};

export default nextConfig;
