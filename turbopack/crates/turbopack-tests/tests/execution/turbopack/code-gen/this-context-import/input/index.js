import { getThis } from "./module.js";
import * as module from "./module.js";

it("should not have this context when calling a binding", () => {
  expect(getThis()).toBe(undefined);
});

it("should have this context when calling a property of an imported module", () => {
  expect(module.getThis()).toBe(module);
});

it("should still be possible to call the function with a different context", () => {
  expect(getThis.call(module)).toBe(module);
  expect(module.getThis.call(module)).toBe(module);
  const obj = {};
  expect(getThis.call(obj)).toBe(obj);
  expect(module.getThis.call(obj)).toBe(obj);
  expect((0, module.getThis)()).toBe(undefined);
});
