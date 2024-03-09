/**
 * @type {import('next').NextConfig}
 */
const config = {}

if (process.env.BASE_PATH) {
  config.basePath = process.env.BASE_PATH
}

module.exports = config
