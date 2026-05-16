import { expect, test, vi } from "vitest";
import { add } from "./add";

// Disables a package that checks that code is only executed on the server side.
// Also, this mock can be defined in the Vitest setup file.
vi.mock("server-only", () => {
  return {};
});

test("Test functions that import server-only", () => {
  expect(add(1, 2)).toBe(3);
});
