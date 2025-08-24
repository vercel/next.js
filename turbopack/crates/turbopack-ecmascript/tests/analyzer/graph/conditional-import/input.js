const a = import(true ? "a" : "b");
const c = import(
  process.env.NEXT_RUNTIME === "edge"
    ? "next/dist/compiled/@vercel/og/index.edge.js"
    : "next/dist/compiled/@vercel/og/index.node.js"
);
let b;

if (true) {
  b = import("a");
} else {
  b = import("b");
}

import { x } from "x";
import { y } from "y";
import { z } from "y";

if (true) {
  x;
} else {
  y;
}

function earlyExit() {
  if (true) {
    return hoisted;
  }

  import("c");
  z;

  function hoisted() {}
}
