import { foo } from "./library/b.js";

output = import("./async.js").then(v => [foo, v.default]);
