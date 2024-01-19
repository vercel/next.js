/** @type {import('next').NextConfig} */
const stylexPlugin = require("@stylexjs/nextjs-plugin");

const nextConfig = {
  pageExtensions: ["js", "jsx", "ts", "tsx"],
  transpilePackages: ["@stylexjs/open-props"],
};

module.exports = stylexPlugin({
  rootDir: __dirname,
})(nextConfig);
