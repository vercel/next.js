import { foo } from "./library/a.js";

output = import("./async.js").then(v => [foo, v.default]);
