/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    outputFileTracingExcludes: {
      '*': ['anyvaluewillcauseit'],
    },
  },
}

module.exports = config
