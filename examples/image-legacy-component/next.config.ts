import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    search: "",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.vercel.com",
        port: "",
        pathname: "/image/upload/**",
      },
    ],
  },
};

export default nextConfig;
