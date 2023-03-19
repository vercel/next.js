/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['res.cloudinary.com', 'avatars.githubusercontent.com'],
  },
}
