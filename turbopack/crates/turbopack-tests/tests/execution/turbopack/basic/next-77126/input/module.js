const shouldRun = () => false

export default function run() {
  if (shouldRun()) {
    var x = true
  }
  if (x) {
    return 'should not run'
  }
  return 'should run'
}
