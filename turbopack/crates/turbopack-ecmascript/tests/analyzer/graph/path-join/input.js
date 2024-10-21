const a = require("foo");

// const b = require.resolve('foo');

const path = require("path");

const z1_joined = path.join("foo", "bar");
const z2_joined = path.join("foo/", "bar");
const z3_joined = path.join("foo", "/bar");
const z4_joined = path.join("foo/", "/bar");
const z5_joined = path.join("foo", "bar", "..", "baz", global, "..", "foo");

const z1_resolved = path.resolve("foo", "bar");
const z2_resolved = path.resolve("/", "foo", "bar");
const z3_resolved = path.resolve("pre", "/", "foo", "bar");
const z4_resolved = path.resolve("pre", "\\\\", "foo", "bar");
const z5_tern = global ? "/" : "\\\\";
const z5_resolved = path.resolve("pre", z5_tern, "foo", "bar");
let z6_alt = "/";
if(global) {
  z6_alt = "\\\\";
}
const z6_resolved = path.resolve("pre", z6_alt, "foo", "bar");
