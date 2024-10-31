import * as ns from "./b.js";

export function f() {
	return foo(ns).f === f;
}

function foo(x) {
	return x;
}
