const api = require('../operations/get-item')

// Returns the express handler function. Necessary so that we can get the nextApp instance.
function getItemRenderer (nextApp) {
  return (req, res) => {
    console.log('Express is handling request')
    const itemData = api.getItem()
    return nextApp.render(req, res, '/item', { itemData })
  }
}

// So that we can do a fetch from the page if rendering client-side.
function getItem (req, res, next) {
  const itemData = api.getItem()
  console.log('API request for item data')
  res.setHeader('content-type', 'application/json')
  res.send(itemData)
}

module.exports = { getItemRenderer, getItem }
