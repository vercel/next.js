const { withPayload } = require("@payloadcms/next-payload");
const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = withPayload(
  {
    reactStrictMode: true,
    rewrites: [{ source: "/admin/(.*)", destination: "/admin/index.html" }],
    images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "nextjs-vercel.payloadcms.com",
          port: "",
          pathname: "/my-account/**",
        },
        {
          protocol: "https",
          hostname: process.env.NEXT_PUBLIC_S3_HOSTNAME,
          port: "",
          pathname: `/${process.env.NEXT_PUBLIC_S3_BUCKET}/**`,
        },
      ],
    },
  },
  {
    configPath: path.resolve(__dirname, "./payload/payload.config.ts"),
  },
);

module.exports = nextConfig;
