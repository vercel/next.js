/** @type {import('next').NextConfig} */
module.exports = {
  outputFileTracingIncludes: {
    '/instrumentation': ['./include-me/**/*'],
  },
}
