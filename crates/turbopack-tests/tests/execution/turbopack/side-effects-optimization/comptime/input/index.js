import { something } from "package/dep.js";
import { something2 } from "package/dep2.js";

it("should not include a module that is side effect free and exports are not used due to static analysis", () => {
  if (false) {
    something();
  } else {
    something2();
  }
});
