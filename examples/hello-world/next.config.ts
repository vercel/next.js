import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    devtoolSegmentExplorer: true,
    devtoolMetadataViewer: true,
  },
};

export default nextConfig;
