it("importing a not existing file should throw", () => {
  // This is a check to make sure that the following tests would fail if they require("fail")
  expect(() => {
    require("./not-existing-file");
  }).toThrow();
});

function maybeReturn(x) {
  if (x) {
    return true;
  }
}

function func() {
  if (false) {
    require("fail");
    import("fail");
  }
  if (true) {
    require("./ok");
  }
  if (true) {
    require("./ok");
  } else {
    require("fail");
    import("fail");
  }
  if (false) {
    require("fail");
    import("fail");
  } else {
    require("./ok");
  }
}

it("should not follow conditional references", () => {
  func();

  expect(func.toString()).not.toContain("import(");
});

it("should allow replacements in IIFEs", () => {
  (function func() {
    if (false) {
      require("fail");
      import("fail");
    }
  })();
});

it("should support functions that only sometimes return", () => {
  let ok = false;
  if (maybeReturn(true)) {
    ok = true;
  }
  expect(ok).toBe(true);
});

it("should evaluate process.turbopack", () => {
  let ok = false;
  if (process.turbopack) {
    ok = true;
  } else {
    require("fail");
    import("fail");
  }
  expect(ok).toBe(true);
});

it("should evaluate !process.turbopack", () => {
  if (!process.turbopack) {
    require("fail");
    import("fail");
  }
});

// it("should evaluate NODE_ENV", () => {
//   if (process.env.NODE_ENV !== "development") {
//     require("fail");
//     import("fail");
//   }
// });
