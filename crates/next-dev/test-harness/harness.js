import * as jest from "jest-circus-browser/dist/umd/jest-circus.js";
import expect from "expect/build-es5/index.js";

let isReady = false;
function autoReady(fn) {
  return (...args) => {
    if (!isReady) {
      isReady = true;
      setImmediate(() => {
        READY("");
      });
    }
    return fn(...args);
  };
}

globalThis.__jest__ = jest;
globalThis.expect = expect;
globalThis.describe = autoReady(jest.describe);
globalThis.it = autoReady(jest.it);

// From https://github.com/webpack/webpack/blob/9fcaa243573005d6fdece9a3f8d89a0e8b399613/test/TestCases.template.js#L422
globalThis.nsObj = function nsObj(obj) {
  Object.defineProperty(obj, Symbol.toStringTag, {
    value: "Module",
  });
  return obj;
};
