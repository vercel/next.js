import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('browserslist-extends', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import styles from './index.module.css'
          
          export default function Page() { 
            return <p className={styles.hello}>hello world</p>
          } 
        `,
        'pages/index.module.css': `
          .hello {
            color: pink;
          }
        `,
      },
      dependencies: {
        'browserslist-config-google': '^3.0.1',
      },
      packageJson: {
        browserslist: ['extends browserslist-config-google'],
      },
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
