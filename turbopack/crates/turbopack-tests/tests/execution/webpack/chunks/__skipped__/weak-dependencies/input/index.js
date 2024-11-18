it("should not include a module with a weak dependency", function () {
  var a = !!__webpack_modules__[require.resolveWeak("./a")];
  var b = !!__webpack_modules__[require.resolve("./b")];
  var c = !!__webpack_modules__[require.resolveWeak("./c")];
  var d = !!__webpack_modules__[require.resolveWeak("./d")];
  require(["./c"]);
  require("./d");

  expect(a).toBe(false);
  expect(b).toBe(true);
  expect(c).toBe(false);
  expect(d).toBe(true);
});
