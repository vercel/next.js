import t from "./library/components.js";

output = import("./async.js").then((c) => [c.default, t().a]);
