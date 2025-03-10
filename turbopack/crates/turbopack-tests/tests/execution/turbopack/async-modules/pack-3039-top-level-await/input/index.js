it("should not hang", async () => {
  debugger;
  const { test } = await import("./wrapper");

  expect(test()).toBe(5);
}, 1000);
