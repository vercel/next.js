import { getOptions, stringifyRequest } from 'loader-utils'

module.exports = function (content, sourceMap) {
  this.cacheable()

  const options = getOptions(this)
  const { buildId, modules } = options

  this.callback(null, `
  // Webpack Polyfill Injector
function main() {${modules.map(module => `\n    require(${stringifyRequest(this, module)});`).join('') + '\n'}}
if (require(${stringifyRequest(this, options.test)})) {
    var js = document.createElement('script');
    js.src = __webpack_public_path__ + '${buildId}/polyfill.js';
    js.onload = main;
    js.onerror = function onError(message) {
        console.error('Could not load the polyfills: ' + message);
    };
    document.head.appendChild(js);
} else {
    main();
}
  `, sourceMap)
}
