export default class Reporter {
  onTestRunEnd() {
    throw new Error('release reporter publication failure')
  }
}
