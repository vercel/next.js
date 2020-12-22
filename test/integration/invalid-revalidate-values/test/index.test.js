/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  killApp,
  File,
  launchApp,
  renderViaHTTP,
  check,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '..')
const pageFile = new File(join(appDir, 'pages/ssg.js'))

let app
let appPort

describe('Invalid revalidate values', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
    await pageFile.restore()
  })

  it('should not show error initially', async () => {
    const html = await renderViaHTTP(appPort, '/ssg')
    expect(html).toContain('a-ok')
  })

  it('should not show error for false revalidate value', async () => {
    pageFile.replace('revalidate: 1', 'revalidate: false')

    try {
      for (let i = 0; i < 3; i++) {
        await waitFor(1000)
        const html = await renderViaHTTP(appPort, '/ssg')
        expect(html).toContain('a-ok')
      }
    } finally {
      pageFile.restore()
    }
  })

  it('should not show error for true revalidate value', async () => {
    pageFile.replace('revalidate: 1', 'revalidate: true')

    try {
      for (let i = 0; i < 3; i++) {
        await waitFor(1000)
        const html = await renderViaHTTP(appPort, '/ssg')
        expect(html).toContain('a-ok')
      }
    } finally {
      pageFile.restore()
    }
  })

  it('should show error for string revalidate value', async () => {
    pageFile.replace('revalidate: 1', 'revalidate: "1"')

    try {
      await check(
        () => renderViaHTTP(appPort, '/ssg'),
        /A page's revalidate option must be seconds expressed as a natural number. Mixed numbers and strings cannot be used. Received/
      )
    } finally {
      pageFile.restore()
    }
  })

  it('should show error for null revalidate value', async () => {
    pageFile.replace('revalidate: 1', 'revalidate: null')

    try {
      await check(
        () => renderViaHTTP(appPort, '/ssg'),
        /A page's revalidate option must be seconds expressed as a natural number. Mixed numbers and strings cannot be used. Received/
      )
    } finally {
      pageFile.restore()
    }
  })

  it('should show error for float revalidate value', async () => {
    pageFile.replace('revalidate: 1', 'revalidate: 1.1')

    try {
      await check(
        () => renderViaHTTP(appPort, '/ssg'),
        /A page's revalidate option must be seconds expressed as a natural number for \/ssg. Mixed numbers, such as/
      )
    } finally {
      pageFile.restore()
    }
  })
})
