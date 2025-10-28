import { WebClient } from '@slack/web-api'

async function slack() {
  if (!process.env.SLACK_TOKEN) {
    throw new Error('SLACK_TOKEN not set')
  }

  const workflowLink = process.env.WORKFLOW_LINK
  if (!workflowLink) {
    throw new Error('WORKFLOW_LINK not set')
  }

  const channel = process.env.SLACK_CHANNEL_ID ?? 'C0668R2391V' // #next-releases
  // TODO: Configure SLACK_ envs for dry run testing to not ping the oncall.
  // TODO: It'll become `@oncall-nextjs`
  const ping = process.env.SLACK_PING ?? '@nextjs-oncall'

  const message =
    (process.env.SLACK_MESSAGE ?? process.env.RELEASE_STATUS === 'true')
      ? `Successfully published a new release!\n<https://github.com/vercel/next.js/releases|Releases Link>`
      : `Failed to publish a new release triggered by "${process.env.WORKFLOW_ACTOR}". ${ping}\n<${workflowLink}|Workflow Link>`

  const slackClient = new WebClient(process.env.SLACK_TOKEN)
  const res = await slackClient.chat.postMessage({
    channel,
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
