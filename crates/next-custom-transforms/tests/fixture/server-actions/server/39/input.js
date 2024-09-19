export async function Foo(x) {
  async function bar() {
    'use cache'
    return 'hi' + x
  }

  return bar()
}

//

const bar = $cache(async function () {
  'use cache'
  return 'hi' + x
})

export async function Foo(x) {
  const bar = registerServerReference('', bar).bind(null, encrypt(x))

  return bar()
}
