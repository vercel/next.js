class Test {
  getString() {
    return 'hello'
  }
}

const getExports = () => ({ default: Test })

module.exports = getExports()
