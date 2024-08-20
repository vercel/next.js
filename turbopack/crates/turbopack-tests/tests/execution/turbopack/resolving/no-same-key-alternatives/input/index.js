import "./dir";
import "package-with-exports/entry1";

it("should not bundle the root level package", () => {
  const modules = Object.keys(__turbopack_modules__);
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/dir\/node_modules\/the-package\/index/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/the-package\/index/)
  );
});

it("should not bundle the other exports conditions", () => {
  require("package-with-exports/entry2");
  const modules = Object.keys(__turbopack_modules__);
  expect(modules).toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/a/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/index/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/b/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/c/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/entry1/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/entry2/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/main/)
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-with-exports\/module/)
  );
});

it("should not bundle the other alternatives", () => {
  require("package-without-exports/entry3");
  const modules = Object.keys(__turbopack_modules__);
  expect(modules).toContainEqual(
    expect.stringMatching(
      /input\/node_modules\/package-without-exports\/entry3\.js/
    )
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(
      /input\/node_modules\/package-without-exports\/entry3\/index/
    )
  );
});

it("should not bundle the other alternatives", () => {
  require("package-without-exports");
  const modules = Object.keys(__turbopack_modules__);
  expect(modules).toContainEqual(
    expect.stringMatching(
      /input\/node_modules\/package-without-exports\/module\.js/
    )
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(
      /input\/node_modules\/package-without-exports\/main\.js/
    )
  );
  expect(modules).not.toContainEqual(
    expect.stringMatching(/input\/node_modules\/package-without-exports\/index/)
  );
});
