jest.mock('prompts', () => jest.fn())

const prompts = require('prompts')
const { confirmVercelDeployment } = require('../transform')

describe('transform runner', () => {
  beforeEach(() => {
    prompts.mockReset()
  })

  it('accepts the default Vercel deployment in non-interactive mode', async () => {
    await expect(confirmVercelDeployment(true)).resolves.toBe(true)
    expect(prompts).not.toHaveBeenCalled()
  })

  it('preserves the deployment prompt in interactive mode', async () => {
    prompts.mockResolvedValue({ isAppDeployedToVercel: false })

    await expect(confirmVercelDeployment(false)).resolves.toBe(false)
    expect(prompts).toHaveBeenCalledTimes(1)
  })
})
