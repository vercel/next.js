import moduleUniversal from "./module-universal.js";
import moduleReassign from "./module-reassign.js"

it("should use the CommonJS variant of universal module definitions", () => {
  expect(moduleUniversal()).toBe("other-dep 1234");
});

it("should not replace typeof exports for non-free variables", () => {
  expect(moduleReassign).toBe(1234);
});
