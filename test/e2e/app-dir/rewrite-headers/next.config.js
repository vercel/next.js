/** @type {import('next').NextConfig} */
module.exports = {
  rewrites: async () => {
    return [
      {
        source: '/hello/sam',
        destination: '/hello/samantha',
      },
      {
        source: '/hello/other',
        destination: '/other',
      },
      {
        source: '/hello/fred',
        destination: '/other?key=value',
      },
      {
        source: '/hello/(.*)/google',
        destination: 'https://www.google.$1/',
      },
      {
        source: '/rewrites-to-query/:name',
        destination: '/other?key=:name',
      },
    ]
  },
}
