export function Component() {
  const data = [1, 2, 3]
  const foo = [2, 3, 4]
  const baz = { value: { current: 1 } }

  async function action() {
    'use server'

    console.log(data.at(1), baz.value, baz.value.current)
    console.log(foo.push.call(foo, 5))
  }

  return <form action={action} />
}
