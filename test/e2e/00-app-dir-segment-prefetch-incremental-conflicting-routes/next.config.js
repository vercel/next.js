/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    ppr: 'incremental',
    dynamicIO: false,
    clientSegmentCache: true,
  },
}
