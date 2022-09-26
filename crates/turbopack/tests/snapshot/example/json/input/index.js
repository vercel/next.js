import pkg from "./package.json";
console.log(pkg.name);
import invalid from "./invalid.json";
console.log(invalid["this-is"]);
