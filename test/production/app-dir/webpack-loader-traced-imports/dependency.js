function requireSub(name) {
  return require(`./sub/${name}`)
}

module.exports = requireSub
