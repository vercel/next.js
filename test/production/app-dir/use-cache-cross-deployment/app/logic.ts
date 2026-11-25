export function getDate() {
  return `${new Date().toISOString()}:${process.env.FOOBAR}`
}
