import { prop as globalFoo } from "foo";
import { prop as localFoo } from "./foo";
import { prop as atFoo } from "@/foo";

console.log(globalFoo, localFoo, atFoo);
