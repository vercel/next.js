export function Component({ list }) {
  return (
    <form
      action={async () => {
        'use server'
        console.log(list.find((x) => !!x))
      }}
    >
      <button>submit</button>
    </form>
  )
}
