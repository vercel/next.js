import fs from 'node:fs/promises'
import path from 'node:path'

export async function getCredits(): Promise<string[]> {
  const creditsPath = path.join(__dirname, 'credits.json')
  const credits: Record<string, ''> = JSON.parse(
    await fs.readFile(creditsPath, 'utf-8')
  )
  return Object.keys(credits)
}
