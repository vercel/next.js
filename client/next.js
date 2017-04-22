import next from './'

next()
  .catch((err) => {
    console.error(`${err.message}\n${err.stack}`)
  })
