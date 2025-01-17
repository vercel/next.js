/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.graphcms.com",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};
