'use server'

let a, f

export async function action0(b, c, ...g) {
  return async function action1(d) {
    'use server'
    let f
    console.log(...window, { window })
    console.log(a, b, action2)

    async function action2(e) {
      'use server'
      console.log(a, c, d, e, f, g)
    }

    return [
      action2,
      async function action3(e) {
        'use server'
        action2(e)
        console.log(a, c, d, e)
      },
    ]
  }
}
