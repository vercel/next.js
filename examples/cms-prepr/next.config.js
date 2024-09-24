/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "b-cdn.net",
        port: "",
        pathname: "/my-account/**",
      },
      {
        protocol: "https",
        hostname: "*.stream.prepr.io",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};
