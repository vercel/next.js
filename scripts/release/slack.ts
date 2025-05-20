import { WebClient } from '@slack/web-api'

async function slack() {
  if (!process.env.SLACK_TOKEN) {
    throw new TypeError('SLACK_TOKEN not set')
  }

  const workflowLink = process.env.WORKFLOW_LINK
  if (!workflowLink) {
    throw new TypeError('WORKFLOW_LINK not set')
  }

  const message =
    process.env.RELEASE_STATUS === 'true'
      ? `Successfully published a new release!\n<https://github.com/vercel/next.js/releases|Releases Link>`
      : `Failed to publish a new release triggered by "${process.env.WORKFLOW_ACTOR}". @nextjs-oncall\n<${workflowLink}|Workflow Link>`

  const slackClient = new WebClient(process.env.SLACK_TOKEN)
  const res = await slackClient.chat.postMessage({
    channel: '#next-releases',
    text: message,
    username: 'Next.js Bot',
    icon_emoji: ':nextjs:',
  })

  if (!res.ok) {
    throw new Error(
      `Failed to send message "${message}" to Slack channel #next-releases: ${res.error}`
    )
  }

  console.log('Successfully sent message to Slack!')
}

slack()
