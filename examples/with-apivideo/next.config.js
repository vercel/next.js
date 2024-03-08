/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    styledComponents: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "vod.api.video",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};

module.exports = nextConfig;
