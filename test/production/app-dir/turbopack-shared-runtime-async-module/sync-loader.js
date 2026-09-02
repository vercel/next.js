/**
 * A minimal, fully synchronous loader. Its module graph contains no async
 * modules, so on its own it asks for a runtime without the top-level-await
 * machinery.
 */
module.exports = function syncLoader(source) {
  return source
}
