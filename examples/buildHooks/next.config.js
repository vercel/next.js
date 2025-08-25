/** @type {import('next').NextConfig} */
const nextConfig = {
  // any configs you need
  experimental: {
    buildHooks: {
      pre: () => {
        console.log(">>>>>>>>> runs on build start");
        return Promise.resolve();
      },
      post: () => {
        console.log(">>>>>>>>> runs after build");
        return Promise.resolve();
      },
      error: () => {
        console.log(">>>>>>>>> runs on error");
        return Promise.resolve();
      },
    },
  },
};

module.exports = nextConfig;
