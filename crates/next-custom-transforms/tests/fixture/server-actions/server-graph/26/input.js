const noop = (action) => action

// TODO: should use `log` as function name?
export const log = noop(async (data) => {
  'use server'
  console.log(data)
})
