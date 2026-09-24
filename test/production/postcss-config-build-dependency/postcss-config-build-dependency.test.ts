import { nextTestSetup } from 'e2e-utils'

const canaryPlugin = `
module.exports = () => ({
  postcssPlugin: 'postcss-canary',
  Once(root, { Rule, Declaration }) {
    root.append(
      new Rule({ selector: '.postcss-canary' }).append(
        new Declaration({ prop: 'color', value: 'red' })
      )
    )
  },
})
module.exports.postcss = true
`

describe('PostCSS config as a build dependency', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: {
      'pages/_app.js': `
        import '../global.css'

        export default function App({ Component, pageProps }) {
          return <Component {...pageProps} />
        }
      `,
      'pages/index.js': `
        export default function Page() {
          return <p>hello world</p>
        }
      `,
      'global.css': `.page { color: blue; }`,
      'postcss-canary.js': canaryPlugin,
      'postcss.config.js': `module.exports = { plugins: {} }`,
    },
    skipStart: true,
  })

  // Turbopack tracks the PostCSS config itself and writes CSS elsewhere.
  if (isTurbopack) {
    it.skip('only applies to webpack', () => {})
    return
  }

  async function readBuiltCss() {
    const files = await next.readFiles('.next/static/css', (file) =>
      file.endsWith('.css')
    )
    return files.join('\n')
  }

  it('should rebuild CSS when only the PostCSS config changes', async () => {
    expect((await next.build()).exitCode).toBe(0)
    expect(await readBuiltCss()).not.toContain('.postcss-canary')

    await next.patchFile(
      'postcss.config.js',
      `module.exports = { plugins: { [require.resolve('./postcss-canary.js')]: {} } }`
    )

    expect((await next.build()).exitCode).toBe(0)
    expect(await readBuiltCss()).toContain('.postcss-canary')
  })

  it('should rebuild CSS when the PostCSS config is removed', async () => {
    await next.deleteFile('postcss.config.js')

    expect((await next.build()).exitCode).toBe(0)
    expect(await readBuiltCss()).not.toContain('.postcss-canary')
  })
})
