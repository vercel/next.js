/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/",
        destination: "/landing-page/landing-page-with-components",
      },
    ];
  },
  redirects() {
    const sourcesRequiringAuthToken = [
      "/",
      "/landing-page/:slug*",
      "/blog/:path*",
    ];

    return process.env.NEXT_PUBLIC_BUTTER_CMS_API_KEY
      ? [
          {
            source: "/missing-token",
            destination: "/",
            permanent: false,
          },
        ]
      : sourcesRequiringAuthToken.map((source) => ({
          source: source,
          destination: "/missing-token",
          permanent: false,
        }));
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.buttercms.com",
        port: "",
        pathname: "/my-account/**",
      },
    ],
  },
};
