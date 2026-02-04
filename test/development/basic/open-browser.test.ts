import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('open browser option', () => {
  describe('with --open CLI flag in next dev', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'app/page.tsx': `export default function Page() { return <div>Hello</div> }`,
        },
        skipStart: true,
        startCommand: 'pnpm next dev --open',
      })
    })

    afterAll(() => next.destroy())

    it('should start server successfully with --open flag', async () => {
      await next.start()

      await retry(async () => {
        const res = await next.fetch('/')
        expect(res.status).toBe(200)
      })
    })
  })

  describe('with --open CLI flag in next start', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'app/page.tsx': `export default function Page() { return <div>Hello</div> }`,
        },
        skipStart: true,
        startCommand: 'pnpm next start --open',
      })
    })

    afterAll(() => next.destroy())

    it('should start production server successfully with --open flag', async () => {
      await next.start()

      await retry(async () => {
        const res = await next.fetch('/')
        expect(res.status).toBe(200)
      })
    })
  })

  describe('with custom port and --open', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'app/page.tsx': `export default function Page() { return <div>Hello</div> }`,
        },
        skipStart: true,
        startCommand: 'pnpm next dev --open -p 4000',
      })
    })

    afterAll(() => next.destroy())

    it('should start server with custom port and --open flag', async () => {
      await next.start()

      await retry(async () => {
        const res = await next.fetch('/')
        expect(res.status).toBe(200)
      })

      expect(next.appPort).toBe('4000')
    })
  })

  describe('without --open flag', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'app/page.tsx': `export default function Page() { return <div>Hello</div> }`,
        },
        skipStart: true,
      })
    })

    afterAll(() => next.destroy())

    it('should start server normally without --open flag', async () => {
      await next.start()

      await retry(async () => {
        const res = await next.fetch('/')
        expect(res.status).toBe(200)
      })
    })
  })
})
