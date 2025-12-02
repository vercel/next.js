self._ENTRIES ||= {}
const modProm = import('MODULE')
modProm.catch(() => {})
self._ENTRIES['VAR_ENTRY_NAME'] = new Proxy(modProm, {
  get(innerModProm, name) {
    if (name === 'then') {
      return (res, rej) => innerModProm.then(res, rej)
    }
    let result = (...args) =>
      innerModProm.then((mod) => (0, mod[name])(...args))
    result.then = (res, rej) =>
      innerModProm.then((mod) => mod[name]).then(res, rej)
    return result
  },
})
