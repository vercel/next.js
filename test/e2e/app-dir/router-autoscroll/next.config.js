/**
 * @type {import('next').NextConfig}
 */
const config = {
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = config
