/* eslint-disable import/no-extraneous-dependencies */
import chalk from 'chalk'
import { getRepoInfo, hasExample, hasRepo, RepoInfo } from './examples'

export interface ExampleInfoContext {
  example?: string
  examplePath?: string
}

export const getExampleInfo = async ({
  example,
  examplePath,
}: ExampleInfoContext) => {
  let repoUrl: URL | undefined
  let repoInfo: RepoInfo | undefined

  if (!example) return

  try {
    repoUrl = new URL(example)
  } catch (error) {
    if (error.code !== 'ERR_INVALID_URL') {
      console.error(error)
      process.exit(1)
    }
  }

  if (repoUrl) {
    if (repoUrl.origin !== 'https://github.com') {
      console.error(
        `Invalid URL: ${chalk.red(
          `"${example}"`
        )}. Only GitHub repositories are supported. Please use a GitHub URL and try again.`
      )
      process.exit(1)
    }

    repoInfo = await getRepoInfo(repoUrl, examplePath)

    if (!repoInfo) {
      console.error(
        `Found invalid GitHub URL: ${chalk.red(
          `"${example}"`
        )}. Please fix the URL and try again.`
      )
      process.exit(1)
    }

    const found = await hasRepo(repoInfo)

    if (!found) {
      console.error(
        `Could not locate the repository for ${chalk.red(
          `"${example}"`
        )}. Please check that the repository exists and try again.`
      )
      process.exit(1)
    }
  } else if (example !== '__internal-testing-retry') {
    const found = await hasExample(example ?? '')

    if (!found) {
      console.error(
        `Could not locate an example named ${chalk.red(
          `"${example}"`
        )}. Please check your spelling and try again.`
      )
      process.exit(1)
    }
  }

  return repoInfo
}
