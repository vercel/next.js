it("should throw a good error when parsing file fails", async () => {
  await expect(import("./broken")).rejects.toMatchObject({
    message:
      "Could not parse module '[project]/crates/turbopack-tests/tests/execution/turbopack/basic/error/input/broken.js'",
  });
});
