export const config = {
  env: ['NOTION_KEY', 'SENTRY_DSN', 'DATABASE_KEY', 'DATABASE_USER'],
}

const items = {}

config.env.forEach(name => {
  items[name] = process.env[name]
})

export default (req, res) => res.json(items)
