export const config = {
  env: ['NOTION_KEY', 'SENTRY_DSN', 'DATABASE_KEY', 'DATABASE_USER'],
}

export default (req, res) => res.json(req.env)
