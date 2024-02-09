import "./dir";

it("should not bundle the root level package", () => {
  const modules = Object.keys(__turbopack_modules__);
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/dir\/node_modules\/the-package\/index/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/the-package\/index/)
  );
});
