import { file, file2 } from "package";

it("should ignore the package", async () => {
  await expect(file).resolves.toEqual({});
  expect(file2).toEqual({});
});
