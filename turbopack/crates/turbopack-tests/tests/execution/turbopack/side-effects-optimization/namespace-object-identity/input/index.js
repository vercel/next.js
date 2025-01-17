import { getSelf, self } from "./esm";
import * as esm from "./esm";
const requiredEsm = require("./esm");

it("should have the same identity on all namespace objects", async () => {
  expect(getSelf()).toBe(esm);
  expect(self).toBe(esm);
  expect(requiredEsm).toBe(esm);
  const importedEsm = await import("./esm");
  expect(importedEsm).toBe(esm);
});
