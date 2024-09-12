it("should load chunk a and b with shared state", async () => {
  let a = await import("./a");
  expect(a.default).toHaveProperty("a", "aaaaaaaaaaa");
  let b = await import("./b");
  expect(b.default).toHaveProperty("b", "bbbbbbbbbbb");
  let aShared = a.shared;
  let bShared = b.shared;
  expect(aShared).toBe(bShared);
});

it("should execute side effects in the correct order", async () => {
  let module = await import("./module");
  expect(module.order).toEqual(["a", "b", "c"]);
});
