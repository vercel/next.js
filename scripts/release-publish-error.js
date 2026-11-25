// @ts-check

const { stripVTControlCharacters } = require('node:util')

/** @param {string} output */
function isAlreadyPublishedError(output) {
  // pnpm may wrap the registry message across lines inside its error box.
  const message = stripVTControlCharacters(output).replace(/[\s│]+/g, ' ')
  return message.includes(
    'cannot publish over the previously published versions'
  )
}

module.exports = { isAlreadyPublishedError }
