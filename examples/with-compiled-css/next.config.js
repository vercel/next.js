/** @type {import('next').NextConfig} */
module.exports = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\.js$/,
      use: ["@compiled/webpack-loader"],
    });

    return config;
  },
};
