const x = require('./packages/next-swc/native/index.wasi.cjs')

const {
  getTargetTriple,
  transformSync,
  transform,
  testReadFileInWasiDirectly,
} = x

console.log('exports', x)
console.log('target triple', {
  triple: getTargetTriple(),
})

const output = transformSync(
  `console.log("hello world");`,
  true,
  Buffer.from(JSON.stringify({}))
)

console.log('transformSync', { output })
;(async () => {
  const o = await transform(
    `console.log("hello world");`,
    true,
    Buffer.from(JSON.stringify({}))
  )

  console.log('async transform', { o })
})()

const r = testReadFileInWasiDirectly(__filename)
console.log('testReadFileInWasiDirectly', { r })
