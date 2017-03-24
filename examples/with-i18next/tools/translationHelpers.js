/* global fetch */
import 'isomorphic-fetch'

export async function getTranslation (lang, file, baseUrl) {
  const response = await fetch(`${baseUrl}${lang}/${file}.json`)
  const json = await response.json()
  let translations = {}
  translations[lang] = {}
  translations[lang][file] = json

  return translations
}
