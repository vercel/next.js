function merge(p1, p2) {
  // merges p1 into p2, essentially just a simple deep copy without array support.
  for (let n in p1) {
    if (p2[n] === false) {
      continue
    } else if (typeof p1[n] === 'object') {
      p2[n] = merge(p1[n], p2[n] || {})
    } else if (p2[n] === undefined) {
      p2[n] = p1[n]
    }
  }
  return p2
}

module.exports = merge(require('./core'), require('./javascript'))
