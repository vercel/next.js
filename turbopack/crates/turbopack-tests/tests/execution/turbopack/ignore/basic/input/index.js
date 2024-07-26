const webpackIgnore = require(/* webpackIgnore: true */ "./non-existent.js");
const turbopackIgnore = require(/* turbopackIgnore: true */ "./non-existent.js");
const webpackImport = import(/* webpackIgnore: false */ "./util.js");
const turbopackImport = import(/* turbopackIgnore: false */ "./util.js");

it("should ignore webpackIgnore comments", () => {
  expect(webpackIgnore).toBeUndefined();
});

it("should ignore turbopackIgnore comments", () => {
  expect(turbopackIgnore).toBeUndefined();
});

it("should not ignore webpackIgnore comments when webpackIgnore is false", () => {
  expect(webpackImport).toBeDefined();
});

it("should not ignore turbopackIgnore comments when turbopackIgnore is false", () => {
  expect(turbopackImport).toBeDefined();
});
