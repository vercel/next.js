
const isServer = typeof window === 'undefined'

let styletron

export default function getStyletron () {
  if (isServer) {
    const Styletron = require('styletron-server')
    styletron = new Styletron()
  } else if (!styletron) {
    const Styletron = require('styletron-client')
    const styleElements = document.getElementsByClassName('_styletron_hydrate_')
    styletron = new Styletron(styleElements)
  }

  return styletron
}

export function flush () {
  const _styletron = styletron
  styletron = null
  return _styletron
}
