export function Component({ list, y }) {
  return (
    <form
      action={async () => {
        'use server'
        console.log(list.find((x) => x === y))
      }}
    >
      <button>submit</button>
    </form>
  )
}
