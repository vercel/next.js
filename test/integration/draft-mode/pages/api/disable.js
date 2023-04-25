export default function handler(_req, res) {
  res.setDraftMode({ enable: false })
  res.end('Check your cookies...')
}
