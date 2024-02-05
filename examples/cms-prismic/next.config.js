/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.prismic.io",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};
