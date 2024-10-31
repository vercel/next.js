import Foo from "lib";

output = import("./b.js").then(v => ([Foo, v]));
