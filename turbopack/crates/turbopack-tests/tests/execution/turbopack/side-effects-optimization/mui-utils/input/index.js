import * as NS1 from "mui-material/generateUtilityClass";
import * as NS2 from "mui-utils";
import * as NS3 from "mui-utils/generateUtilityClass";

it("should import renamed exports correctly", () => {
  const ns = Object(NS1);
  expect(typeof ns.default).toBe("function");
  expect(ns.default()).toBe("ok");
});

it("should import renamed exports correctly", () => {
  const ns = Object(NS2);
  expect(typeof ns.unstable_generateUtilityClass).toBe("function");
  expect(ns.unstable_generateUtilityClass()).toBe("ok");
});

it("should import renamed exports correctly", () => {
  const ns = Object(NS3);
  expect(typeof ns.default).toBe("function");
  expect(ns.default()).toBe("ok");
});
