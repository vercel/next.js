import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('modularize-imports', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        app: new FileRef(join(__dirname, 'modularize-imports/app')),
      },
      dependencies: {
        'lucide-react': '0.264.0',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should render the icons correctly without creating all the modules', async () => {
    let logs = ''
    next.on('stdout', (log) => {
      logs += log
    })

    const html = await next.render('/')

    // Ensure the icons are rendered
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"')

    const modules = [
      ...logs.matchAll(
        /compiled client and server successfully in \d+(\.\d+)?(s| ms) \((\d+) modules\)/g
      ),
    ]

    expect(modules.length).toBeGreaterThan(1)
    for (const [, , , moduleCount] of modules) {
      // Ensure that the number of modules is less than 1000 - otherwise we're
      // importing the entire library.
      expect(parseInt(moduleCount)).toBeLessThan(1000)
    }
  })
})
