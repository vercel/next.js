const a = import(true ? "a" : "b")
const c = import(process.env.NEXT_RUNTIME === 'edge'
  ? 'next/dist/compiled/@vercel/og/index.edge.js'
  : 'next/dist/compiled/@vercel/og/index.node.js')
let b;

if (true) {
  b = import("a")
} else {
  b = import("b")
}
