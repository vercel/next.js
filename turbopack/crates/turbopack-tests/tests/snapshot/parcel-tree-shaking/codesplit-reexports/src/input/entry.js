import { foo, bar } from "../library";

output = import("./async").then(v => [v.default, [foo, bar]])
