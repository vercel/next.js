let pkg;

try {
  pkg = require("packages/not-found");
} catch (e) {
  pkg = require("packages/found");
}

pkg.fn();
