import moduleUniversal from "./module-universal.js";
import moduleReassign from "./module-reassign.js"
import moduleEsm from "./module-esm.mjs"

it("should use the CommonJS variant of universal module definitions", () => {
  expect(moduleUniversal()).toBe(1234);
});

it("should not replace typeof exports for non-free variables", () => {
  expect(moduleReassign).toBe(1234);
});

it("should replace typeof CJS globals with undefined in ESM", () => {
  expect(moduleEsm).toBe("undefined undefined undefined");
});

