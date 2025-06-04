import fs from "fs";
import path from "path";

function getData() {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "content/hello.json"), "utf8")
  );
}

console.log(getData());
