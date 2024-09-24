/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.umbraco.io",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};
