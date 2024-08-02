// const webpackRequire = require(/* webpackIgnore: false */ "./util.js");
// const turbopacRequire = require(/* turbopackIgnore: false */ "./util.js");
const webpackRequireIgnore = require(/* webpackIgnore: true */ "./ignore.js");
// const turbopackRequireIgnore = require(/* turbopackIgnore: true */ "./ignore.js");

it("should ignore webpackRequireIgnore comments", () => {
  expect(webpackRequireIgnore).toBeUndefined();
});

// it("should ignore turbopackRequireIgnore comments", () => {
//   expect(turbopackRequireIgnore).toBeUndefined();
// });

// it("should not ignore webpackRequire comments", () => {
//   expect(webpackRequire).toBeDefined();
// });

// it("should not ignore turbopackRequire comments", () => {
//   expect(turbopacRequire).toBeDefined();
// });
