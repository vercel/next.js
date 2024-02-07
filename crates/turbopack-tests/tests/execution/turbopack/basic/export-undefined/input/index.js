import * as module from "./module.js";
import mod from "./module.js";

it("should allow to export undefined", () => {
  expect(module).toHaveProperty("default", undefined);
  expect(mod).toBe(undefined);
});
