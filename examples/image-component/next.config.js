/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    search: "",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.vercel.com",
        port: "",
        pathname: "/image/upload/**",
      },
    ],
  },
};
