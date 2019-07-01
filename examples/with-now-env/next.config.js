console.log({
  SECRET: process.env.SECRET,
  ANOTHER_SECRET: process.env.ANOTHER_SECRET
})

module.exports = {
  env: {
    SECRET: process.env.SECRET
  }
}
