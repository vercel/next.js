/** @type {import('next').NextConfig} */
const nextConfig = {
  // any configs you need
  experimental: {
    buildHooks: {
      pre: () => {
        console.log(">>>>>>>>> runs on build start");
      },
      post: () => {
        console.log(">>>>>>>>> runs after build");
      },
      error: () => {
        console.log(">>>>>>>>> runs on error");
      },
    },
  },
};

module.exports = nextConfig;
