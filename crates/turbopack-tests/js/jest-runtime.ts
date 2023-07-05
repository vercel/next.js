declare const __turbopack_external_require__: (id: string) => any;
const jest = __turbopack_external_require__("jest-circus");
const expectMod = __turbopack_external_require__("expect");

global.describe;
globalThis.describe = jest.describe;
globalThis.it = jest.it;
globalThis.test = jest.test;
globalThis.expect = expectMod.expect;

// From https://github.com/webpack/webpack/blob/9fcaa243573005d6fdece9a3f8d89a0e8b399613/test/TestCases.template.js#L422
globalThis.nsObj = function nsObj(obj) {
  Object.defineProperty(obj, Symbol.toStringTag, {
    value: "Module",
  });
  return obj;
};
