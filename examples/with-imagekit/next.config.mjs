/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ik.imagekit.io", // For further details on ImageKit URLs, please visit https://imagekit.io/docs/integration/connect-external-storage#url-endpoints.
        port: "",
      },
    ],
  },
};

export default nextConfig;
