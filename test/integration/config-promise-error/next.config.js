module.exports = (phase, { isServer }) => {
  return new Promise(resolve => {
    resolve({ target: 'serverless' })
  })
}
