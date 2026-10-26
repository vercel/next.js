module.exports = {
  async headers() {
    return [
      {
        source: '/isg-custom-header',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=1234',
          },
        ],
      },
    ]
  },
}
