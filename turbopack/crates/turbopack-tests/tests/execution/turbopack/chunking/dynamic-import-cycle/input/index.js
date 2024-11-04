it("should not crash on dynamic import cycle", async () => {
  const a1 = await import("./a.js");
  expect(a1.ok).toBe("a");
  const b1 = await a1.test();
  expect(b1.ok).toBe("b");
  const a2 = await b1.test();
  expect(a2.ok).toBe("a");
  expect(a2).toBe(a1);
});
