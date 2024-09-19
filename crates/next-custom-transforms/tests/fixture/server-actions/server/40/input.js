function Comp(c) {
  return (
    <form
      action={async function foo(a, b = a + c) {
        'use server'
      }}
    ></form>
  )
}
