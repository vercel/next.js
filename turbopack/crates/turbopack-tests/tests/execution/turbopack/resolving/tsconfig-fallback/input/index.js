import foo from "@foo";
import fooBar from "@foo/bar";
import bazFoo from "@baz/foo";
import srcBazFoo from "@src/baz/foo";

it("should resolve an alias to a local file", () => {
  expect(foo).toBe("foo");
  expect(require("@foo")).toHaveProperty("default", "foo");
});

it("should fallback from an alias", () => {
  expect(fooBar).toBe("@foo/bar");
  expect(require("@foo/bar")).toHaveProperty("default", "@foo/bar");
});

it("should prefer alias over normal resolving", () => {
  expect(bazFoo).toBe("baz/foo");
  expect(require("@baz/foo")).toHaveProperty("default", "baz/foo");
});

it("should resolve the alternative alias value", () => {
  expect(srcBazFoo).toBe("baz/foo");
  expect(require("@src/baz/foo")).toHaveProperty("default", "baz/foo");
});
