import { Octokit } from 'octokit'
import { env } from '@/lib/env'

let octokitInstance: Octokit | null = null

export function getOctokit(): Octokit {
  if (!octokitInstance) {
    octokitInstance = new Octokit({
      auth: env.GITHUB_TOKEN,
    })
  }
  return octokitInstance
}
