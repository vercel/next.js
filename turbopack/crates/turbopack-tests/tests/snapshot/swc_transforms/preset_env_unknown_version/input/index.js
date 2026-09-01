class Foo {}

async function exponentiate() {
  return 10n ** 18n
}

const cjk = /\p{Script=Han}/u

console.log(Foo, exponentiate, cjk)

export default 123
