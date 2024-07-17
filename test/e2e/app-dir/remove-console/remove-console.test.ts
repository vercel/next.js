import { nextTestSetup } from 'e2e-utils'

describe('remove-console', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should remove console.log', async () => {
    let stdout = jest.fn()
    let stderr = jest.fn()
    next.on('stdout', stdout)
    next.on('stderr', stderr)

    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    expect(stdout).not.toHaveBeenCalledWith('MY LOG MESSAGE\n')
    expect(stderr).toHaveBeenCalledWith('MY ERROR MESSAGE\n')
  })
})
