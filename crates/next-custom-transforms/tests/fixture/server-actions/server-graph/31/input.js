'use server'

export const action = {
  async f(x) {
    ;(() => {
      console.log(x)
    })()
  },
}.f

export const action2 = new (class X {
  async f(x) {
    ;(() => {
      console.log(x)
    })()
  }
})().f
