import type { NextConfig } from "next";
import withRspack from "next-rspack";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
};

export default withRspack(nextConfig);
