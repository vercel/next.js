const mathAsyncModule = require("./math");

it("should handle wasm imports", async () => {
  // math.js is an async module, so we require it and await inside this function to make sure the entrypoint isn't async.
  const {
    add,
    factorial,
    factorialJavascript,
    fibonacci,
    fibonacciJavascript,
  } = await mathAsyncModule;

  expect(add(22, 2200)).toEqual(22 + 2200);
  expect(factorial(10)).toEqual(factorialJavascript(10));
  expect(fibonacci(15)).toEqual(fibonacciJavascript(15));
});
