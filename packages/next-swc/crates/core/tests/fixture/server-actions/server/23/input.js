export default function Page({ foo, x, y }) {
  async function action(a, b, c, d) {
    'use server'
    console.log(a, b, x, c, d)
  }

  return action.bind(null, foo[0], foo[1], foo.x, foo[y])
}
