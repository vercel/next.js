import { a, b, default as def } from "esm-external/package";

it(`should reexport all exports from an external esm module`, async () => {
  expect(def).toBe("default");

  expect(a).toBe("a");
  expect(b).toBe("b");
});
