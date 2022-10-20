const a = require("foo");

// const b = require.resolve('foo');

const path = require("path");

const z1_joined = path.join("foo", "bar");
const z2_joined = path.join("foo/", "bar");
const z3_joined = path.join("foo", "/bar");
const z4_joined = path.join("foo/", "/bar");
const z5_joined = path.join("foo", "bar", "..", "baz", global, "..", "foo");
