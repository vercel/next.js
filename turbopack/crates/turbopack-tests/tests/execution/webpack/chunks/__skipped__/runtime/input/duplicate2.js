require.ensure(["./b"], function (require) {
  expect(require("./b")).toBe("a");
});
