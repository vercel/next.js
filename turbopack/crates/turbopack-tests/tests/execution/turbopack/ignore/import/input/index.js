const webpackImportIgnore = import(/* webpackIgnore: true */ "./ignore.js");

it("should ignore webpackImportIgnore comments", () => {
  expect(webpackImportIgnore).toBe({});
});
