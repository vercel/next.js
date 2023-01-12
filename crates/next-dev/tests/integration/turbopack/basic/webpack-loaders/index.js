import source from "./hello.raw";

it("runs a simple loader", () => {
  expect(source).toBe("Hello World");
});
