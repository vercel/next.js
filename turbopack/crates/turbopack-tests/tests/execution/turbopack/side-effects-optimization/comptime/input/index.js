import { something } from "package/dep.js";
import { something2 } from "package/dep2.js";

it("should not include a module that is side effect free and exports are not used due to static analysis", () => {
  if (true) {
    something2();
    return;
  }
  something();
});
