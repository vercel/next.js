/** @type {import('next').NextConfig} */
module.exports = {
  async redirects() {
    return [
      {
        source: '/foo',
        destination: 'https://example.vercel.sh/',
        permanent: true,
      },
    ]
  },
}
