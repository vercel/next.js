/** @type {import('next').NextConfig} */
module.exports = {
  async headers() {
    return [
      {
        source: '/foo',
        headers: [
          {
            key: 'x-foo',
            value: 'bar',
          },
        ],
      },
    ]
  },
}
