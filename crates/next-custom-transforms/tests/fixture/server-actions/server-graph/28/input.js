let a, f

function Comp(b, c, ...g) {
  return async function action1(d) {
    'use server'
    let f
    // @ts-expect-error: window is not iterable
    console.log(...window, { window })
    console.log(a, b, action2)

    // FIXME: invalid transformation of hoisted functions (https://github.com/vercel/next.js/issues/57392)
    // (remove output.js from `tsconfig.json#exclude` to see the error)
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
