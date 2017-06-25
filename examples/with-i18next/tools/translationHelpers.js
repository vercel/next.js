/* global fetch */
import 'isomorphic-fetch'

export async function getTranslation (lang, file, baseUrl) {
  const response = await fetch(`${baseUrl}${lang}/${file}.json`)
  const json = await response.json()

  return {
    [lang]: {
      [file]: json
    }
  }
}
