import { esm, esmPlain, loadInvalidCjs, loadInvalidEsm } from "esm-package";
import { auto, autoPlain } from "auto-package";

it("should have the commonjs module as default export in specified ESM", () => {
  expect(esm).toMatchObject({
    __esModule: true,
    named: "named",
  });
  expect(esmPlain).toMatchObject({
    named: "named",
  });
});

it("should not have the commonjs module as default export in specified ESM", () => {
  expect(auto).toMatchObject({
    __esModule: true,
    named: "named",
  });
  expect(autoPlain).toMatchObject({
    named: "named",
  });
});

it("should error for invalid esm exports", async () => {
  let value = await loadInvalidEsm();
  expect(value).toMatchObject({
    __esModule: true,
  });
});

it("should error for invalid cjs exports", async () => {
  let value = await loadInvalidCjs();
  expect(value).toMatchObject({
    __esModule: true,
    named: "named",
  });
});
