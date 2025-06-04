module.exports = async function (results) {
  // wait 1ms
  await new Promise((resolve) => setTimeout(resolve, 1))

  // return results as JSON
  return 'Async results:\n' + JSON.stringify(results)
}
