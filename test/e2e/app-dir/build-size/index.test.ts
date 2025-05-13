import { nextTestSetup } from 'e2e-utils'

describe('app-dir build size', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should have correct size in build output', async () => {
      const regex = /(\S+)\s+([\d.]+\s\w+)\s+([\d.]+\s\w+)/g
      const matches = [...next.cliOutput.matchAll(regex)]

      const result = matches.reduce((acc, match) => {
        const [, path, size, firstLoadJS] = match

        acc[path] = { size, firstLoadJS }
        return acc
      }, {})

      // convert pretty-bytes format into bytes so we can compare units
      const sizeToBytes = (size: string) => {
        const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        const [value, unit] = size.split(' ', 2)
        const exp = units.indexOf(unit)
        return parseFloat(value) * Math.pow(1024, exp)
      }

      const index = result['/']
      const foo = result['/foo']

      expect(sizeToBytes(index.firstLoadJS)).toBeGreaterThan(0)
      expect(sizeToBytes(foo.firstLoadJS)).toBeGreaterThan(0)

      // index route is a page with no client JS, so it could serve zero additional JS (size = 0)
      // foo route is a page with client references, so it has to serve additional non-shared JS
      expect(sizeToBytes(foo.size)).toBeGreaterThan(0)

      // foo has a client component, so it should be larger than index
      expect(sizeToBytes(foo.size)).toBeGreaterThan(sizeToBytes(index.size))
    })
  } else {
    it('should skip next dev for now', () => {})
    return
  }
})
