import { getCjsState, getCjsState2 } from "./cjs";
import { getState, getState2 } from "./esm";

it("should not duplicate cjs modules", () => {
  expect(getCjsState()).toBe(getCjsState2());
});

it("should not duplicate ES modules", () => {
  expect(getState()).toBe(getState2());
});
