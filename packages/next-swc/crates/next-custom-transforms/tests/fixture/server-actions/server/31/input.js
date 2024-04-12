'use server'

export const action = {
  async f(x) {
    ;(() => {
      console.log(x)
    })()
  },
}.f
