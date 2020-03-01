import initNext, * as next from './'

window.next = next

initNext().catch(err => {
  console.error(`${err.message}\n${err.stack}`)
})
