/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.datocms-assets.com",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};
