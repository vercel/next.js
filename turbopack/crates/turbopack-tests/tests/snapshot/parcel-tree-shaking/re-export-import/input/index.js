import { foo, Other } from "./b.js";
import { foo as foo2, Other as Other2 } from "./c.js";
import { foo as foo3 } from "./d.js";

output = foo() + Other + foo2() + Other2 + foo3();
