import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/image-api/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
