import fs from 'node:fs/promises'
import path from 'node:path'
import { getCredits } from './get-credits'

describe('getCredits', () => {
  const creditsPath = path.join(__dirname, 'credits.json')
  let originalCredits: string

  beforeAll(async () => {
    // Save original credits.json content
    originalCredits = await fs.readFile(creditsPath, 'utf-8')
  })

  afterAll(async () => {
    // Restore original credits.json content
    await fs.writeFile(creditsPath, originalCredits)
  })

  it('should return array of credit names', async () => {
    await fs.writeFile(
      creditsPath,
      JSON.stringify({
        foo: '',
        bar: '',
      })
    )
    expect(await getCredits()).toEqual(['foo', 'bar'])
  })

  it('should return empty array when credits.json is empty object', async () => {
    await fs.writeFile(creditsPath, JSON.stringify({}))
    expect(await getCredits()).toEqual([])
  })
})
