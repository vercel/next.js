import { getState, state } from "./esm";
import * as esm from "./esm";

it("should not allow to modify exports", () => {
  const initialState = getState();
  expect(getState()).toBe(state);
  expect(() => (esm.state = { not: "allowed" })).toThrow();
  expect(() => (esm.newExport = { not: "allowed" })).toThrow();
  expect(getState()).toBe(initialState);
  expect(state).toBe(initialState);
  expect(esm.state).toBe(initialState);
});
