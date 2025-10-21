export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body /*style={{ backgroundColor: randomColor() }}*/>{children}</body>
    </html>
  )
}

// const randomColor = () => {
//   const [r, g, b] = exitAls(() => [Math.random(), Math.random(), Math.random()])
//   const color = (n: number) => 127 + Math.floor(64 * n)
//   return `rgb(${color(r)}, ${color(g)}, ${color(b)})`
// }

// const exitAls = require('node:async_hooks').AsyncLocalStorage.snapshot()
