import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  compiler: {
    // Remove `console.*` output except `console.error`
    removeConsole: {
      exclude: ["error"],
    },
    // Uncomment this to suppress all logs.
    // removeConsole: true,
  },
};

export default nextConfig;
