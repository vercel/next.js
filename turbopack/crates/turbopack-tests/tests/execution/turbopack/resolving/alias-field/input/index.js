import { file1, file2, file3, file4, file5 } from "package/dir";

it("should follow the alias field for a resolved file", () => {
  expect(file1).toBe("file1");
});

it("should follow the alias field for a raw request", () => {
  expect(file2).toBe("file2");
});

it("should follow the alias field for a resolved file without ./ prefix", () => {
  expect(file3).toBe("file3");
});

it("should follow the alias field for a module request", () => {
  expect(file4).toBe("file4");
});

it("should follow the alias field for a module request with subpath", () => {
  expect(file5).toBe("file5");
});

import { otherPackage, otherPackageSubPath } from "package/dir";
it("should not cycle when following the alias field", () => {
  expect(otherPackage).toBe("other-package/index");
  expect(otherPackageSubPath).toBe("other-package/sub-path");
});
