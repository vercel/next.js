export default function Page({ foo, x, y }) {
  async function action(a, b, c, { d }) {
    'use server'
    console.log(a, b, foo, d)
  }
}
