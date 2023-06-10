/** @type {import('next').NextConfig} */

module.exports = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true /**static sites can not optimize images */,
  },
}
