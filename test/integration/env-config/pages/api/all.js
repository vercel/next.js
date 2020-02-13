export const config = {
  env: ['NOTION_KEY', 'DATABASE_SECRET', 'APP_TITLE', 'SENTRY_DSN'],
}

export default async (req, res) => {
  // Only for testing, don't do this...
  res.json(req.env)
}
