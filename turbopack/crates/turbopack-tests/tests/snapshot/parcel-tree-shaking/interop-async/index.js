import c from "./client.js";

output = import("./viewer.js")
	.then((v) => v.default)
	.then((v) => [c.toString(), v[0].toString(), v[1].toString()]);
