it("should allow to import an rejected async module again", async () => {
  await expect(require("./main")).rejects.toEqual(
    expect.objectContaining({
      message: expect.stringContaining("expected rejection 1"),
    })
  );
  await expect(require("./module")).rejects.toEqual(
    expect.objectContaining({
      message: expect.stringContaining("expected rejection 1"),
    })
  );
  await expect(require("./module?2")).rejects.toEqual(
    expect.objectContaining({
      message: expect.stringContaining("expected rejection 2"),
    })
  );
  await expect(require("./reexport?2")).rejects.toEqual(
    expect.objectContaining({
      message: expect.stringContaining("expected rejection 1"),
    })
  );
  await Promise.all([
    expect(require("./module?3")).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringContaining("expected rejection 3"),
      })
    ),
    expect(require("./module?4")).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringContaining("expected rejection 4"),
      })
    ),
    expect(require("./module?5")).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringContaining("expected rejection 5"),
      })
    ),
  ]);
});
