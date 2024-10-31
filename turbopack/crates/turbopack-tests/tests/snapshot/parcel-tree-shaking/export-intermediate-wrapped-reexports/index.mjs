import { bar } from "./foo/foo.mjs";

output = [bar, import("./async").then(mod => mod.default)];
