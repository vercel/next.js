import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('Middleware fetches with body', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/default.js': `
          export default (req, res) => res.json({ body: req.body })
        `,
        'pages/api/size_limit_5kb.js': `
          export const config = { api: { bodyParser: { sizeLimit: '5kb' } } }
          export default (req, res) => res.json({ body: req.body })
        `,
        'pages/api/size_limit_5mb.js': `
          export const config = { api: { bodyParser: { sizeLimit: '5mb' } } }
          export default (req, res) => res.json({ body: req.body })
        `,
        'pages/api/body_parser_false.js': `
          export const config = { api: { bodyParser: false } }

          async function buffer(readable) {
            const chunks = []
            for await (const chunk of readable) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
            }
            return Buffer.concat(chunks)
          }

          export default async (req, res) => {
            const buf = await buffer(req)
            const rawBody = buf.toString('utf8');

            res.json({ rawBody, body: req.body })
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server';

          export default async (req) => NextResponse.next();
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  describe('with default bodyParser sizeLimit (1mb)', () => {
    it('should return 413 for body greater than 1mb', async () => {
      const bodySize = 1024 * 1024 + 1
      const body = 'r'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/default',
        {},
        {
          body,
          method: 'POST',
        }
      )

      try {
        expect(res.status).toBe(413)

        if (!(global as any).isNextDeploy) {
          expect(res.statusText).toBe('Body exceeded 1mb limit')
        }
      } catch (err) {
        // TODO: investigate occasional EPIPE errors causing
        // a 500 status instead of a 413
        if (res.status !== 500) {
          throw err
        }
      }
    })

    it('should be able to send and return body size equal to 1mb', async () => {
      const bodySize = 1024 * 1024
      const body = 'B1C2D3E4F5G6H7I8J9K0LaMbNcOdPeQf'.repeat(bodySize / 32)

      const res = await fetchViaHTTP(
        next.url,
        '/api/default',
        {},
        {
          body,
          method: 'POST',
        }
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.body.length).toBe(bodySize)
      expect(data.body.split('B1C2D3E4F5G6H7I8J9K0LaMbNcOdPeQf').length).toBe(
        bodySize / 32 + 1
      )
    })

    it('should be able to send and return body greater than default highWaterMark (16KiB)', async () => {
      const bodySize = 16 * 1024 + 1
      const body =
        'CD1E2F3G4H5I6J7K8L9M0NaObPcQdReS'.repeat(bodySize / 32) + 'C'

      const res = await fetchViaHTTP(
        next.url,
        '/api/default',
        {},
        {
          body,
          method: 'POST',
        }
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.body.length).toBe(bodySize)
      expect(data.body.split('CD1E2F3G4H5I6J7K8L9M0NaObPcQdReS').length).toBe(
        512 + 1
      )
    })
  })

  describe('with custom bodyParser sizeLimit (5kb)', () => {
    it('should return 413 for body greater than 5kb', async () => {
      const bodySize = 5 * 1024 + 1
      const body = 's'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/size_limit_5kb',
        {},
        {
          body,
          method: 'POST',
        }
      )

      try {
        expect(res.status).toBe(413)

        if (!(global as any).isNextDeploy) {
          expect(res.statusText).toBe('Body exceeded 5kb limit')
        }
      } catch (err) {
        // TODO: investigate occasional EPIPE errors causing
        // a 500 status instead of a 413
        if (res.status !== 500) {
          throw err
        }
      }
    })

    it('should be able to send and return body size equal to 5kb', async () => {
      const bodySize = 5120
      const body = 'DEF1G2H3I4J5K6L7M8N9O0PaQbRcSdTe'.repeat(bodySize / 32)

      const res = await fetchViaHTTP(
        next.url,
        '/api/size_limit_5kb',
        {},
        {
          body,
          method: 'POST',
        }
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.body.length).toBe(bodySize)
      expect(data.body.split('DEF1G2H3I4J5K6L7M8N9O0PaQbRcSdTe').length).toBe(
        bodySize / 32 + 1
      )
    })
  })

  describe('with custom bodyParser sizeLimit (5mb)', () => {
    it('should return 413 for body greater than 5mb', async () => {
      const bodySize = 5 * 1024 * 1024 + 1
      const body = 'u'.repeat(bodySize)

      const res = await fetchViaHTTP(
        next.url,
        '/api/size_limit_5mb',
        {},
        {
          body,
          method: 'POST',
        }
      )

      try {
        expect(res.status).toBe(413)

        if (!(global as any).isNextDeploy) {
          expect(res.statusText).toBe('Body exceeded 5mb limit')
        }
      } catch (err) {
        // TODO: investigate occasional EPIPE errors causing
        // a 500 status instead of a 413
        if (res.status !== 500) {
          throw err
        }
      }
    })

    if (!(global as any).isNextDeploy) {
      it('should be able to send and return body size equal to 5mb', async () => {
        const bodySize = 5 * 1024 * 1024
        const body = 'FGHI1J2K3L4M5N6O7P8Q9R0SaTbUcVdW'.repeat(bodySize / 32)

        const res = await fetchViaHTTP(
          next.url,
          '/api/size_limit_5mb',
          {},
          {
            body,
            method: 'POST',
          }
        )
        const data = await res.json()

        expect(res.status).toBe(200)
        expect(data.body.length).toBe(bodySize)
        expect(data.body.split('FGHI1J2K3L4M5N6O7P8Q9R0SaTbUcVdW').length).toBe(
          bodySize / 32 + 1
        )
      })
    }
  })

  describe('with bodyParser = false', () => {
    it('should be able to send and return with body size equal to 16KiB', async () => {
      const bodySize = 16 * 1024
      const body = 'HIJK1L2M3N4O5P6Q7R8S9T0UaVbWcXdY'.repeat(bodySize / 32)

      const res = await fetchViaHTTP(
        next.url,
        '/api/body_parser_false',
        {},
        {
          body,
          method: 'POST',
        }
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.body).toBeUndefined()
      expect(data.rawBody.length).toBe(bodySize)
      expect(
        data.rawBody.split('HIJK1L2M3N4O5P6Q7R8S9T0UaVbWcXdY').length
      ).toBe(bodySize / 32 + 1)
    })

    it('should be able to send and return with body greater than 16KiB', async () => {
      const bodySize = 1024 * 1024
      const body = 'JKLM1N2O3P4Q5R6S7T8U9V0WaXbYcZdA'.repeat(bodySize / 32)

      const res = await fetchViaHTTP(
        next.url,
        '/api/body_parser_false',
        {},
        {
          body,
          method: 'POST',
        }
      )
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.body).toBeUndefined()
      expect(data.rawBody.length).toBe(bodySize)
      expect(
        data.rawBody.split('JKLM1N2O3P4Q5R6S7T8U9V0WaXbYcZdA').length
      ).toBe(bodySize / 32 + 1)
    })
  })

  it('should return 413 for body equal to 10mb', async () => {
    const bodySize = 10 * 1024 * 1024
    const body = 't'.repeat(bodySize)

    const res = await fetchViaHTTP(
      next.url,
      '/api/size_limit_5mb',
      {},
      {
        body,
        method: 'POST',
      }
    )

    try {
      expect(res.status).toBe(413)

      if (!(global as any).isNextDeploy) {
        expect(res.statusText).toBe('Body exceeded 5mb limit')
      }
    } catch (err) {
      // TODO: investigate occasional EPIPE errors causing
      // a 500 status instead of a 413
      if (res.status !== 500) {
        throw err
      }
    }
  })
})
