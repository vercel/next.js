export default class HarmonyCompatibilityDependencyTemplate {
  apply (dep, source) {
    source.insert(-10, `
  const __webpack_exports__ = module.exports = exports = {};
  Object.defineProperty(__webpack_exports__, "__esModule", { value: true });

  const __webpack_require__ = require;

  __webpack_require__.o = function(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
  };

  // Via MainTemplate
  // define getter function for harmony exports
  __webpack_require__.d = function(exports, name, getter) {
    if(!__webpack_require__.o(exports, name)) {
      Object.defineProperty(exports, name, {
        configurable: false,
        enumerable: true,
        get: getter
      });
    }
  };

  // getDefaultExport function for compatibility with non-harmony modules");
  __webpack_require__.n = function(module) {
    var getter = module && module.__esModule ?
      function getDefault() { return module['default']; } :
      function getModuleExports() { return module; };
      __webpack_require__.d(getter, 'a', getter);
    return getter;
  };
`)
  }
};
