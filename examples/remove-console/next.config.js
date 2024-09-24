// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  compiler: {
    // Remove `console.*` output except `console.error`
    removeConsole: {
      exclude: ["error"],
    },
    // Uncomment this to suppress all logs.
    // removeConsole: true,
  },
};

module.exports = nextConfig;
