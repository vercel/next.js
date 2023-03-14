it("should run a basic API request", async () => {
  const res = await fetch("/api/basic?input=test");
  const json = await res.json();
  expect(json).toEqual({ hello: "world", input: "test" });
});

it("should run a basic edge API request", async () => {
  const res = await fetch("/api/edge?input=test");
  const json = await res.json();
  expect(json).toEqual({ hello: "world", input: "test" });
});
