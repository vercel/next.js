// Replaces the placeholder in `*.marker.js` modules, so the build output proves
// that the loader ran.
module.exports = function markerLoader(source) {
  return source.replace('__LOADER_PLACEHOLDER__', 'loader-applied')
}
