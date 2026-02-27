import { nextTestSetup } from 'e2e-utils'

describe('standalone mode and optimizeCss', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.js': `
        import styles from './index.module.css'
        
        export default function Page() { 
          return <p className={styles.home}>hello world</p>
        } 
      `,
      'pages/index.module.css': `
        .home {
          background: orange;
          color: black;
        }
      `,
    },
    nextConfig: {
      experimental: {
        optimizeCss: true,
      },
      output: 'standalone',
    },
    dependencies: {
      critters: '0.0.16',
    },
    // TODO optimizeCss is broken when ?dpl is added to CSS URLs
    disableAutoSkewProtection: true,
  })

  it('should work', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello world')
    expect(html).toContain('background:orange')
  })
})
