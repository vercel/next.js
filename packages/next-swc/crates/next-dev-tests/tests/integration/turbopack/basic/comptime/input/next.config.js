module.exports = {};

function f() {
  if (!process.turbopack) {
    throw new Error("Turbopack is not enabled");
  }
  if (process.env.NODE_ENV !== "development") {
    throw new Error("NODE_ENV is not development");
  }
}

f();

// if (f.toString().includes("process.turbopack")) {
//   throw new Error("process.turbopack is not replaced");
// }
