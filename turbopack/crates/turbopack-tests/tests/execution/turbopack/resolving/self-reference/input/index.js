import env from "self-reference/env";

it("should allow self-referencing imports using the exports field", () => {
  expect(env).toBe(123);
});
