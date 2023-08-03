describe("complex wasm", () => {
  it("should be possible to use imported memory", async () => {
    // magic.js is an async module, so we import it inside this function to make sure the entrypoint isn't async.
    const { get, set } = await import("./magic.js");

    set(42);
    expect(get()).toEqual(42);
    set(123);
    expect(get()).toEqual(123);
  });

  it("should be possible to use imported functions", async () => {
    // magic.js is an async module, so we import it inside this function to make sure the entrypoint isn't async.
    const { getNumber } = await import("./magic.js");

    // random numbers
    expect(getNumber()).toBeGreaterThanOrEqual(0);
    expect(getNumber()).toBeGreaterThanOrEqual(0);
  });
});
