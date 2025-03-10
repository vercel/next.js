import { a as a1, b as b1, c as c1 } from "./side-effects/reexport-internal.js";

const cases = {
  "async module with side effects via dynamic import": () =>
    import("./side-effects/reexport-internal.js"),
  "async module with side effects via esm import": async () =>
    (await import("./side-effects/reexport-internal-test.js")).default,
  "async module with side effects via require": () =>
    require("./side-effects/reexport-internal.js"),
  "async module flagged side-effect-free via dynamic import": () =>
    import("./side-effect-free/reexport-internal.js"),
  "async module flagged side-effect-free via esm import": async () =>
    (await import("./side-effect-free/reexport-internal-test.js")).default,
  "async module flagged side-effect-free via require": () =>
    require("./side-effect-free/reexport-internal.js"),
  "module with externals with side effects via dynamic import": () =>
    import("./side-effects/reexport-external.js"),
  "module with externals with side effects via esm import": async () =>
    (await import("./side-effects/reexport-external-test.js")).default,
  "module with externals with side effects via require": () =>
    require("./side-effects/reexport-external.js"),
  "module with externals flagged side-effect-free via dynamic import": () =>
    import("./side-effect-free/reexport-external.js"),
  "module with externals flagged side-effect-free via esm import": async () =>
    (await import("./side-effect-free/reexport-external-test.js")).default,
  "module with externals flagged side-effect-free via require": () =>
    require("./side-effect-free/reexport-external.js"),
};

for (const [name, fn] of Object.entries(cases)) {
  it(`should reexport a ${name} with side effects optimization`, async () => {
    const { a, b, c } = await fn();
    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(c).toBe("c");
  });
}
