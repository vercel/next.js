import initNext, * as next from './'

window.next = next

console.log('hello!');
initNext()
  .catch((err) => {
    console.error(`${err.message}\n${err.stack}`)
  })
