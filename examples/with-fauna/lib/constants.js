const resolveDbDomain = () => {
  return process.env.FAUNA_DB_DOMAIN ?? 'db.fauna.com'
}

module.exports = {
  resolveDbDomain,
}
