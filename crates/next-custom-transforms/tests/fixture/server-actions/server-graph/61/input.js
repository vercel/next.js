export function ComponentA({ list, y }) {
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

export function ComponentB({ list, y }) {
  return (
    <form
      action={async () => {
        'use server'
        console.log(
          list.find(function (x) {
            return x === y
          })
        )
      }}
    >
      <button>submit</button>
    </form>
  )
}
