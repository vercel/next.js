import * as x from "./b.js";

function get(obj, prop) {
	return obj[prop];
}

let a = get(x, "v");
get(x, "update")();
let b = get(x, "v");

output = [a, b];
