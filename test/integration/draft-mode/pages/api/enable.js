export default function handler(_req, res) {
  res.setDraftMode({ enable: true })
  res.end('Check your cookies...')
}
