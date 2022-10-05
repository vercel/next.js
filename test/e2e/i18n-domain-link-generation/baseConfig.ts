import { NextConfig } from 'next/server/config-shared'
import webdriver from 'next-webdriver'

export default {
  i18n: {
    locales: ['en', 'de'],
    defaultLocale: 'en',
    domains: [
      {
        http: true,
        domain: 'example.com',
        defaultLocale: 'en',
        locales: ['en'],
      },
      {
        http: true,
        domain: 'de.example.com',
        defaultLocale: 'de',
        locales: ['de'],
      },
    ],
  },
} as Partial<NextConfig>

// Chrome only;
// We can probably make it work in firefox as well with `network.dns.forceResolve`
const browserArgs = ['--host-resolver-rules=MAP example.com 127.0.0.1']

export const createDomainScopedWebdriver = async (port: string, url = '/') =>
  await webdriver(`http://example.com:${port}`, url, {
    browserArgs: browserArgs,
  })
