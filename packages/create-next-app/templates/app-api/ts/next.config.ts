import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // API routes configuration
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  },
};

export default nextConfig;
