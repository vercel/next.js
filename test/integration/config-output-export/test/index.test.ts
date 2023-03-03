/* eslint-env jest */
import {
  fetchViaHTTP,
  File,
  findPort,
  getRedboxHeader,
  hasRedbox,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import fs from 'fs'

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))
let app
const runDev = async (config: any) => {
  await nextConfig.write(`module.exports = ${JSON.stringify(config)}`)
  const port = await findPort()
  const obj = { port, stdout: '', stderr: '' }
  app = await launchApp(appDir, port, {
    stdout: false,
    onStdout(msg: string) {
      obj.stdout += msg || ''
    },
    stderr: false,
    onStderr(msg: string) {
      obj.stderr += msg || ''
    },
  })
  return obj
}

describe('config-output-export', () => {
  afterEach(async () => {
    await killApp(app).catch(() => {})
    await nextConfig.restore()
  })

  it('should work with static homepage', async () => {
    const result = await runDev({
      output: 'export',
    })
    const response = await fetchViaHTTP(result.port, '/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(
      '<div id="__next">Hello World</div>'
    )
    expect(result.stderr).toBeEmpty()
  })

  it('should error with i18n', async () => {
    const { stderr } = await runDev({
      output: 'export',
      i18n: {
        locales: ['en'],
        defaultLocale: 'en',
      },
    })
    expect(stderr).toContain(
      'Specified "i18n" cannot but used with "output: export".'
    )
  })

  it('should error with rewrites', async () => {
    const { stderr } = await runDev({
      output: 'export',
      rewrites: [{ source: '/from', destination: '/to' }],
    })
    expect(stderr).toContain(
      'Specified "rewrites" cannot but used with "output: export".'
    )
  })

  it('should error with redirects', async () => {
    const { stderr } = await runDev({
      output: 'export',
      redirects: [{ source: '/from', destination: '/to', permanent: true }],
    })
    expect(stderr).toContain(
      'Specified "redirects" cannot but used with "output: export".'
    )
  })

  it('should error with headers', async () => {
    const { stderr } = await runDev({
      output: 'export',
      headers: [
        {
          source: '/foo',
          headers: [{ key: 'x-foo', value: 'val' }],
        },
      ],
    })
    expect(stderr).toContain(
      'Specified "headers" cannot but used with "output: export".'
    )
  })

  it('should error with api routes', async () => {
    const pagesApi = join(appDir, 'pages/api')
    let result
    let response
    try {
      fs.mkdirSync(pagesApi)
      fs.writeFileSync(
        join(pagesApi, 'wow.js'),
        'export default (_, res) => res.end("wow")'
      )
      result = await runDev({
        output: 'export',
      })
      response = await fetchViaHTTP(result.port, '/api/wow')
    } finally {
      await killApp(app).catch(() => {})
      fs.rmSync(pagesApi, { recursive: true, force: true })
    }
    expect(response.status).toBe(404)
    expect(result?.stderr).toContain(
      'API Routes cannot be used with "output: export".'
    )
  })

  it('should error with middleware', async () => {
    const middleware = join(appDir, 'middleware.js')
    let result: { stdout: string; stderr: string; port: number } | undefined
    let response: Response | undefined
    try {
      fs.writeFileSync(
        middleware,
        'export function middleware(req) { console.log("[mw]",request.url) }'
      )
      result = await runDev({
        output: 'export',
      })
      response = await fetchViaHTTP(result.port, '/api/mw')
    } finally {
      await killApp(app).catch(() => {})
      fs.rmSync(middleware)
    }
    expect(response.status).toBe(404)
    expect(result?.stdout + result?.stderr).not.toContain('[mw]')
    expect(result?.stderr).toContain(
      'Middleware cannot be used with "output: export".'
    )
  })

  it('should error with isr', async () => {
    const blog = join(appDir, 'pages/blog.js')
    let result: { stdout: string; stderr: string; port: number } | undefined
    let browser: any
    try {
      fs.writeFileSync(
        blog,
        `export default function Blog({ posts }) {
          return posts.map(p => (<div key={p}>{p}</div>))
         }
         
         export async function getStaticProps() {
          return { 
           props: { posts: ["my isr post"] },
           revalidate: 10
          }
         }`
      )
      result = await runDev({
        output: 'export',
      })
      browser = await webdriver(result.port, '/blog')
    } finally {
      await killApp(app).catch(() => {})
      fs.rmSync(blog)
    }
    expect(await hasRedbox(browser, true)).toBe(true)
    expect(await getRedboxHeader(browser)).toContain(
      'ISR cannot be used with "output: export".'
    )
    expect(result?.stderr).toContain(
      'ISR cannot be used with "output: export".'
    )
  })

  it('should work with gsp', async () => {
    const blog = join(appDir, 'pages/blog.js')
    let result: { stdout: string; stderr: string; port: number } | undefined
    let browser: any
    try {
      fs.writeFileSync(
        blog,
        `export default function Blog({ posts }) {
          return posts.map(p => (<div key={p}>{p}</div>))
         }
         
         export async function getStaticProps() {
          return { 
           props: { posts: ["my gsp post"] },
          }
         }`
      )
      result = await runDev({
        output: 'export',
      })
      browser = await webdriver(result.port, '/blog')
    } finally {
      await killApp(app).catch(() => {})
      fs.rmSync(blog)
    }
    expect(await hasRedbox(browser, false)).toBe(false)
  })

  it('should error with gssp', async () => {
    const blog = join(appDir, 'pages/blog.js')
    let result: { stdout: string; stderr: string; port: number } | undefined
    let browser: any
    try {
      fs.writeFileSync(
        blog,
        `export default function Blog({ posts }) {
          return posts.map(p => (<div key={p}>{p}</div>))
         }
         
         export async function getServerSideProps() {
          return { 
            props: { posts: ["my ssr post"] },
          }
         }`
      )
      result = await runDev({
        output: 'export',
      })
      browser = await webdriver(result.port, '/blog')
    } finally {
      await killApp(app).catch(() => {})
      fs.rmSync(blog)
    }
    expect(await hasRedbox(browser, true)).toBe(true)
    expect(await getRedboxHeader(browser)).toContain(
      'getServerSideProps cannot be used with "output: export".'
    )
    expect(result?.stderr).toContain(
      'getServerSideProps cannot be used with "output: export".'
    )
  })

  it('should error with fallback true', async () => {
    const posts = join(appDir, 'pages/posts')
    let result: { stdout: string; stderr: string; port: number } | undefined
    let browser: any
    try {
      fs.mkdirSync(posts)
      fs.writeFileSync(
        join(posts, '[slug].js'),
        `export default function Post(props) {
          return <h1>Hello from {props.slug}</h1>
         }
         
         export async function getStaticPaths({ params }) {
          return { 
            paths: [
              { params: { slug: 'one' } },
            ],
            fallback: true,
          }
         }

         export async function getStaticProps({ params }) {
          return { 
           props: { slug: params.slug },
          }
         }`
      )
      result = await runDev({
        output: 'export',
      })
      browser = await webdriver(result.port, '/posts/one')
      expect(await hasRedbox(browser, false)).toBe(false)
      browser = await webdriver(result.port, '/posts/two')
      expect(await hasRedbox(browser, true)).toBe(true)
    } finally {
      await killApp(app).catch(() => {})
      fs.rmSync(posts, { recursive: true, force: true })
    }
    expect(await getRedboxHeader(browser)).toContain(
      'getStaticPaths with "fallback: true" cannot be used with "output: export".'
    )
    expect(result?.stderr).toContain(
      'getStaticPaths with "fallback: true" cannot be used with "output: export".'
    )
  })
})
