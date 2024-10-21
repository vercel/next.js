'use cache'

const foo = async () => {
  return 'foo'
}

export { bar }

async function bar() {
  return 'bar'
}

// Should not be wrapped in $$cache__.
const qux = async function qux() {
  return 'qux'
}

const baz = async function () {
  return qux() + 'baz'
}

const quux = async () => {
  return 'quux'
}

export { foo, baz }
export default quux
