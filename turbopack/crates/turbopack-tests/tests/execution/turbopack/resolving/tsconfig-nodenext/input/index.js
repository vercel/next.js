import foo from "./src/foo.js";
import bar from "./src/bar.js";
import fooEsm from "./src/foo-esm.mjs";
import fooCjs from "./src/foo-cjs.cjs";

it("should correctly resolve explicit extensions with nodenext", () => {
  expect(foo).toBe("foo");
  expect(bar).toBe("bar");
  expect(fooEsm).toBe("fooEsm");
  expect(fooCjs).toBe("fooCjs");
});
