const a = require("foo");

// const b = require.resolve('foo');

const path = require("path");

const z1_joined = path.join("foo", "bar");
const z2_joined = path.join("foo/", "bar");
const z3_joined = path.join("foo", "/bar");
const z4_joined = path.join("foo/", "/bar");
const z5_joined = path.join("foo", "bar", "..", "baz", global, "..", "foo");

const p1 = require("path");
import p2 from "path";
import {join as pjoin} from "path";

const path_join1 = p1.join;
const path_join2 = p2.join;
const path_join3 = pjoin;
const { join: path_join4 } = await import('path')
