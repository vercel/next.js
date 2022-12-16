/* eslint-env jest */
import path from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { findPort } from 'next-test-utils'

describe('Multi Zones', () => {
  const isDev = (global as any).isNextDev
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance | undefined

  afterEach(async () => {
    try {
      await next?.destroy()
    } catch (_) {}
  })

  it('should build the monorepo and navigate properly', async () => {
    const mainAppPort = await findPort()
    const docsAppPort = await findPort()

    next = await createNext({
      files: {
        apps: new FileRef(path.join(__dirname, 'monorepo/apps')),
        packages: new FileRef(path.join(__dirname, 'monorepo/packages')),
        'pnpm-workspace.yaml': new FileRef(
          path.join(__dirname, 'monorepo/pnpm-workspace.yaml')
        ),
        'turbo.json': new FileRef(path.join(__dirname, 'monorepo/turbo.json')),
        'apps/main/.env': `DOCS_URL=http://localhost:${docsAppPort}`,
        'apps/main/package.json': JSON.stringify({
          name: 'main',
          private: true,
          scripts: {
            dev: `next dev -p ${mainAppPort}`,
            build: 'next build',
            start: `next start -p ${mainAppPort}`,
          },
          dependencies: {
            react: 'latest',
            'react-dom': 'latest',
            '@acme/ui': 'workspace:*',
          },
        }),
        'apps/docs/package.json': JSON.stringify({
          name: 'docs',
          private: true,
          scripts: {
            dev: `next dev -p ${docsAppPort}`,
            build: 'next build',
            start: `next start -p ${docsAppPort}`,
          },
          dependencies: {
            react: 'latest',
            'react-dom': 'latest',
            '@acme/ui': 'workspace:*',
          },
        }),
      },
      packageJson: {
        scripts: {
          build: 'turbo run build',
          dev: 'turbo run dev',
          start: 'turbo run start',
        },
        devDependencies: {
          turbo: 'latest',
        },
      },
      buildCommand: 'pnpm build',
      startCommand: isDev ? 'pnpm dev' : 'pnpnm start',
      apps: ['apps/main', 'apps/docs'],
      packages: ['packages/acme-ui'],
    })

    expect(await next.readFile('pnpm-lock.yaml')).toBeTruthy()

    const browser = await webdriver(mainAppPort, '/')
    const aboutHref = await browser
      .elementByCss('#about-link-module')
      .getAttribute('href')

    expect(aboutHref).toBe('/about')

    const docsAboutHref = await browser
      .elementByCss('#docs-link')
      .click()
      .waitForElementByCss('#docs-app')
      .elementByCss('#about-link-module')
      .getAttribute('href')

    expect(docsAboutHref).toBe('/docs/about')
  })
})
