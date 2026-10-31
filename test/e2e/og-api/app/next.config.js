/** @type {import('next').NextConfig} */
module.exports = {
  ...(process.env.TEST_OUTPUT_STANDALONE === 'true'
    ? { output: 'standalone' }
    : {}),
}
