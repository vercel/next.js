const a = import(true ? "a" : "b")

let b;

if (true) {
  b = import("a")
} else {
  b = import("b")
}
