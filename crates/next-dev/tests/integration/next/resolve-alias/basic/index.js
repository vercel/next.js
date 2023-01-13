import foo from "foo";

it("aliases foo to bar through the next.config.js experimental.resolveAlias property", () => {
  expect(foo).toBe(42);
});
