export const trace = []
let arrived = 0,
  resolve
const ready = new Promise((done) => (resolve = done))
export async function meet() {
  if (++arrived === 2) resolve()
  await ready
}
