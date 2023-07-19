// @ts-check
import { context } from '@actions/github'
import { info, setFailed } from '@actions/core'
import { graphql } from '@octokit/graphql'

const offTopicComments = ['+1']

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) return

    const { comment } = context.payload
    if (!comment) return

    const { node_id: subjectId, body } = comment

    if (offTopicComments.some((comment) => body === comment)) {
      await graphql(
        `
          mutation minimize($subjectId: ID!) {
            minimizeComment(
              input: { subjectId: $subjectId, classifier: OFF_TOPIC }
            ) {
              minimizedComment {
                isMinimized
              }
            }
          }
        `,
        {
          subjectId,
          headers: { authorization: `token ${process.env.GITHUB_TOKEN}` },
        }
      )

      info(`Comment (${body.slice(0, 15)}) was minimized.`)
    }
  } catch (error) {
    setFailed(error)
  }
}

run()
