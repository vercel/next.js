it("should allow to use top-level-await", () => {
  return import("./reexport").then(({ default: value, other }) => {
    expect(value).toBe(42);
    expect(other).toBe(42);
  });
});
