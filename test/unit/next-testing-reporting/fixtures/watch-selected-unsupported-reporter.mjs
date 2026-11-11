export default class Reporter {
  onTestRunStart() {
    this.onTestSuiteReady = () => {}
  }
}
