require.ensure(["./a"], function (require) {
  expect(require("./a")).toBe("a");
});
