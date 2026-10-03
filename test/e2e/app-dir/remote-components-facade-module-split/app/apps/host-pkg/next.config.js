const {
  withRemoteComponentsConfig,
} = require('remote-components/config/nextjs')
const { withMicrofrontends } = require('@vercel/microfrontends/next/config')

/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = withRemoteComponentsConfig(withMicrofrontends(nextConfig), {
  shared: ['demo-pkg-rc'],
})
