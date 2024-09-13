it("should error when importing an invalid export", () => {
  expect(require("./invalid-export").default).toBe(undefined);
})
