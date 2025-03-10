import { report } from "../tick";
import "./d";

report("async2 before");
await 0;
report("async2 middle");
await 0;
report("async2 after");
