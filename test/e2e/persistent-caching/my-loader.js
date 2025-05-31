module.exports = async function myLoader(source) {
  // Make webpack consider the build as large change which makes it persistent cache it sooner
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return source.replace(/Timestamp/g, `Timestamp = ${Date.now()}`)
}
