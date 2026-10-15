export default function setup() {
  return () => {
    throw new Error('release teardown failure')
  }
}
