class Test {
  getString() {
    return 'hello'
  }
}

const getExports = () => ({ __esModule: true, default: Test })

module.exports = getExports()
