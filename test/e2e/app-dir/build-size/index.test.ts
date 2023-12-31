import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir build size',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextStart }) => {
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

        // index route has a page, so it should not be 0
        expect(sizeToBytes(index.size)).toBeGreaterThan(0)
        expect(sizeToBytes(index.firstLoadJS)).toBeGreaterThan(0)

        // foo route has a page, so it should not be 0
        expect(sizeToBytes(foo.size)).toBeGreaterThan(0)
        expect(sizeToBytes(foo.firstLoadJS)).toBeGreaterThan(0)

        // foo is a client component, so it should be larger than index
        expect(sizeToBytes(foo.size)).toBeGreaterThan(sizeToBytes(index.size))
      })
    } else {
      it('should skip next dev for now', () => {})
      return
    }
  }
)
