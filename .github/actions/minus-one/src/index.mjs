// @ts-check
import { context } from '@actions/github'
import { info, setFailed } from '@actions/core'
import { graphql } from '@octokit/graphql'

function isUnhelpfulComment(text) {
  // Borrowed from Refined GitHub:
  // https://github.com/refined-github/refined-github/blob/c864a20b57bb433aaf3952f88d83c9fc481ae6ff/source/helpers/is-low-quality-comment.ts#L2-L3
  return (
    text.replace(
      /[\s,.!?👍👎👌🙏]+|[\u{1F3FB}-\u{1F3FF}]|[+-]\d+|⬆️|ditt?o|me|too|t?here|on|same|this|issues?|please|pl[sz]|any|updates?|bump|question|solution|following/giu,
      ''
    ) === ''
  )
}

async function run() {
  try {
    if (!process.env.GITHUB_TOKEN) return

    const { comment } = context.payload
    if (!comment) return

    const { node_id: subjectId, body } = comment

    if (isUnhelpfulComment(body)) {
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
