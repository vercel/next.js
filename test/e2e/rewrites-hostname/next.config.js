/** @type {import('next').NextConfig} */
const config = {
  httpAgentOptions: { keepAlive: process.env.TEST_KEEP_ALIVE === 'true' },
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
