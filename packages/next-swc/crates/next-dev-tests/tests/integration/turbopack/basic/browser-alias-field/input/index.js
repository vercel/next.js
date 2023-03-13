import value from "./node.js";
import indirect from "./dir/indirect.js";

it("should alias with browser field", () => {
  expect(value).toBe(42);
  expect(indirect).toBe(42);
});
