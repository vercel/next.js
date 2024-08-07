import {loadSub, loadSub2} from "./src/foo";

it("should support dynamic requests with tsconfig.paths", () => {
  expect(loadSub("file2.js").default).toBe("file2");
});

it("should support dynamic requests with tsconfig.paths and without extension", () => {
  expect(loadSub("file2").default).toBe("file2");
});

it("should support dynamic requests with tsconfig.paths and multiple dynamic parts", () => {
  expect(loadSub2("file2").default).toBe("file2");
});
