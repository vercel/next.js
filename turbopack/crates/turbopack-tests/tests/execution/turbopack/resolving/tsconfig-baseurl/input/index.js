import foo from "foo";

it("should resolve modules in the baseUrl", () => {
  expect(foo).toBe("foo");
});
