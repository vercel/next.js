import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'Do not cache uncacheable fetch methods and headers',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should cache GET methods', async () => {
      const firstRun = await next
        .render$('/GET')
        .then(($) => $('#result').text())
      const secondRun = await next
        .render$('/GET')
        .then(($) => $('#result').text())

      expect(firstRun).toBe(secondRun)
    })

    it('should cache POST methods with force-cache', async () => {
      const firstRun = await next
        .render$('/POST?forceCache=true')
        .then(($) => $('#result').text())
      const secondRun = await next
        .render$('/POST?forceCache=true')
        .then(($) => $('#result').text())

      expect(firstRun).toBe(secondRun)
    })

    it('should not cache POST methods without authorization header', async () => {
      const firstRun = await next
        .render$('/POST')
        .then(($) => $('#result').text())
      const secondRun = await next
        .render$('/POST')
        .then(($) => $('#result').text())

      expect(firstRun).not.toBe(secondRun)
    })

    it('should not cache POST methods with authorization header', async () => {
      const firstRun = await next
        .render$('/POST?auth=true')
        .then(($) => $('#result').text())
      const secondRun = await next
        .render$('/POST?auth=true')
        .then(($) => $('#result').text())

      expect(firstRun).not.toBe(secondRun)
    })

    it('should not cache GET methods with an authorization header', async () => {
      const firstRun = await next
        .render$('/GET?auth=true')
        .then(($) => $('#result').text())
      const secondRun = await next
        .render$('/GET?auth=true')
        .then(($) => $('#result').text())

      expect(firstRun).not.toBe(secondRun)
    })

    it('should not cache PUT methods', async () => {
      const firstRun = await next
        .render$('/PUT')
        .then(($) => $('#result').text())
      const secondRun = await next
        .render$('/PUT')
        .then(($) => $('#result').text())

      expect(firstRun).not.toBe(secondRun)
    })

    it('should not cache DELETE methods', async () => {
      const firstRun = await next
        .render$('/DELETE')
        .then(($) => $('#result').text())
      const secondRun = await next
        .render$('/DELETE')
        .then(($) => $('#result').text())

      expect(firstRun).not.toBe(secondRun)
    })
  }
)
