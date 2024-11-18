import {loadSub, loadSubNested, loadSubFallback} from "./src/foo";

it("should support dynamic requests with tsconfig.paths", () => {
  expect(loadSub("file2.js").default).toBe("file2");
});

it("should support dynamic requests with tsconfig.paths and without extension", () => {
  expect(loadSub("file2").default).toBe("file2");
});

it("should support dynamic requests with tsconfig.paths and multiple dynamic parts", () => {
  expect(loadSubNested("file2").default).toBe("file2");
});

it("should support dynamic requests with tsconfig.paths fallbacks", () => {
  expect(loadSubFallback("file1").default).toBe("file1");
  expect(loadSubFallback("file4").default).toBe("file4-fallback");
});
