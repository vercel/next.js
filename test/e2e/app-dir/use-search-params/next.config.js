/** @type {import("next").NextConfig} */
const config = {
  experimental: {
    missingSuspenseWithCSRBailout: true,
  },
}

module.exports = config
