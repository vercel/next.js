import { getOptions, stringifyRequest } from 'loader-utils'

module.exports = function (content, sourceMap) {
  this.cacheable()

  const options = getOptions(this)
  const { buildId, modules } = options

  this.callback(null, `
  // Webpack Polyfill Injector
function main() {${modules.map(module => `\n    require(${stringifyRequest(this, module)});`).join('') + '\n'}}
if (require(${stringifyRequest(this, options.test)})) {
    window.afterPoly = main;
    var js = document.createElement('script');
    js.onerror = function onError(message) {
      Raven.captureException(new Error('Could not load the polyfills: ' + message));
    };
    js.src = __NEXT_DATA__.publicPath + '${buildId}/polyfill.js';
    document.head.appendChild(js);
} else {
    main();
}
  `, sourceMap)
}
