import debug from "debug";
import { value } from "./module";
import { value as imported } from "imported";
import { a } from "utils/a";
import { b } from "utils/b";
import { c } from "utils";

console.log(value, imported as any, a, b, c);
