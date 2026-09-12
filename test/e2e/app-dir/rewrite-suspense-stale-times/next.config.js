/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
  },
}
