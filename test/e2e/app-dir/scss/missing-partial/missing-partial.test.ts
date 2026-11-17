import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
;(isNextDev ? describe : describe.skip)('missing Sass partial', () => {
  const { next } = nextTestSetup({
    dependencies: { sass: '1.54.0' },
    files: {
      'pages/index.js': `
        import styles from './index.module.scss'
        export default function Page() {
          return <p id="message" className={styles.message}>Sass</p>
        }
      `,
      'pages/index.module.scss': `
        @use './tokens';
        .message { color: tokens.$color; }
      `,
    },
  })

  it('recovers when the missing partial is created', async () => {
    expect((await next.fetch('/')).status).toBe(500)

    await next.patchFile('pages/_tokens.scss', '$color: rgb(65, 43, 21);')

    await retry(async () => {
      expect((await next.fetch('/')).status).toBe(200)
    })
    const browser = await next.browser('/')
    expect(await browser.elementById('message').getComputedCss('color')).toBe(
      'rgb(65, 43, 21)'
    )
  })
})
