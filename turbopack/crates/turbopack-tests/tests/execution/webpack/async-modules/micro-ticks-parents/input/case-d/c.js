import { report } from "../tick";
import "./a";

report("c before");
await 0;
report("c after");
