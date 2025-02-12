import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    search: "",
    localPatterns: [
      {
        pathname: "/image-api/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
