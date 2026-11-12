import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

async function expectPng(res: Response, width: number, height: number) {
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('image/png')
  const png = Buffer.from(await res.arrayBuffer())
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  // The IHDR chunk is always first
  expect(png.readUInt32BE(16)).toBe(width)
  expect(png.readUInt32BE(20)).toBe(height)
}

describe('ImageResponse with experimental.imgOptSafeMode', () => {
  describe('with nsio', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should render in the node runtime', async () => {
      await expectPng(await next.fetch('/og-node'), 600, 315)
    })

    it('should render in the edge runtime', async () => {
      await expectPng(await next.fetch('/api/og-edge'), 600, 315)
    })
  })

  // Breaks nsio to show which runtimes use it. Deployments don't use the local
  // environment variables.
  // @force-gate !deploy
  describe('with a missing nsio worker binary', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      env: {
        NEXT_SAFE_IMAGE_OPTIMIZATION_WORKER_PATH: '/nonexistent/nsio-worker',
      },
    })

    it('should use nsio in the node runtime', async () => {
      // The image is rendered while streaming the body, so the connection is
      // closed instead of returning an error status
      await expect(
        next.fetch('/og-node').then((res) => res.arrayBuffer())
      ).rejects.toThrow()
      await retry(() => {
        expect(next.cliOutput).toContain(
          'failed to spawn /nonexistent/nsio-worker'
        )
      })
    })

    it('should not use nsio in the edge runtime', async () => {
      await expectPng(await next.fetch('/api/og-edge'), 600, 315)
    })
  })
})
