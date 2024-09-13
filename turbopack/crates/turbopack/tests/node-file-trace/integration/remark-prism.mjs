import { unified } from "unified";
import parse from "remark-parse";
import prism from "remark-prism";

const engine = unified().use(parse).use(prism);
const ast = engine.parse("# markdown");
engine.runSync(ast);
