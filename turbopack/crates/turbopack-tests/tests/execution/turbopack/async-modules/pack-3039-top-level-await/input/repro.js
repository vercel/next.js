export const x = 5

const a = 10
if (a !== 10) {
  // intentionally nothing, the skipped await point causes the problem
  await 0
}
