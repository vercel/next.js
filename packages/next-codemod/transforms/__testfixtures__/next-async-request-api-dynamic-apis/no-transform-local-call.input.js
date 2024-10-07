export function LocalComponent(callback) {
  function cookies() {
    return 'local-cookies'
  }

  callback(cookies())
}
