import { run } from "./d.js";

var logger = run(module) ? "a" : "b";
export { logger };
