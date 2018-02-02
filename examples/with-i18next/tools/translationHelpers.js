/* global fetch */
import 'isomorphic-fetch'

/**
 * Fetch translation file(s).
 * @function getTranslation
 * @param {string} lang - Language to fetch.
 * @param {array} files - Translation files to fetch.
 * @param {string} baseUrl - Locale location.
 * @return {object} Fetched translation files.
 */
export async function getTranslation (lang, files, baseUrl) {
  let translation = {}

  for (let file of files) {
    const response = await fetch(`${baseUrl}${lang}/${file}.json`)
    translation[file] = await response.json()
  }

  return { [lang]: translation }
}
