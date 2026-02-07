import type { NextConfig } from "next";

const nextConfig = {
  experimental: {
    mdxRs: true,
    turbo: {
      rules: {
        "*.react.svg": {
          loaders: ["@svgr/webpack"],
          as: "*.js",
        },
      },
    },
  },
  // Other config properties
  webpack(config) {
    return config;
  },
} satisfies NextConfig;

export default nextConfig;
