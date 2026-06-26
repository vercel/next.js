/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "imgix.cosmicjs.com",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};
