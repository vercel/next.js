export const config = {
  env: ['NOTION_KEY', 'SENTRY_DSN'],
}

export default async (req, res) => {
  // Only for testing, don't do this...
  res.json(req.env)
}
