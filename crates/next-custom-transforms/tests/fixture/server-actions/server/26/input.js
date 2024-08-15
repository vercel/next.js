const noop = (action) => action

export const log = noop(async (data) => {
  'use server'
  console.log(data)
})
