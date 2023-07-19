// @ts-check
import { context } from '@actions/github'
import { info, setFailed } from '@actions/core'
import { graphql } from '@octokit/graphql'

if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not set')

/**
MIT License

Copyright (c) Sindre Sorhus sindresorhus@gmail.com (sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
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
