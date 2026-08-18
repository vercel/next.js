/** @type {import('next').NextConfig} */
const config = {
  rewrites() {
    return [
      {
        source: '/rewrite-idn-case-unicode',
        destination: `http://你好.localhost:${process.env.TEST_TARGET_PORT}`,
      },
    ]
  },
}

module.exports = config
