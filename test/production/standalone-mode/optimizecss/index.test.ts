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
    dependencies: {
      beasties: '0.4.2',
    },
    nextConfig: {
      experimental: {
        optimizeCss: true,
      },
      output: 'standalone',
    },
  })

  it('should work', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello world')
    expect(html).toContain('background:orange')
  })
})
