it("should allow to import an async module twice", async () => {
  const result = await require("./main");
  expect(result.default).toBe("hello world, hello world");
});
