import { prop as globalFoo } from "foo";
import { prop as localFoo } from "./foo";
import { prop as atFoo } from "@/foo";

import * as bar from "bar";

console.log(globalFoo, localFoo, atFoo, bar);
