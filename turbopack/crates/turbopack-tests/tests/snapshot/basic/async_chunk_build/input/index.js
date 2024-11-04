import { bar } from "bar";
import "./shared";

bar(true);

import("./import").then(({ foo }) => {
  foo(true);
});
