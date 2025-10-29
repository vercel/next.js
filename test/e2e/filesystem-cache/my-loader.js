module.exports = async function myLoader(source) {
  console.log(`Run my-loader on ${this.resourcePath}`)
  return source.replace(/Loader/g, 'hello world')
}
