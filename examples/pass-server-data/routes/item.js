const api = require('../operations/get-item')

// Returns the express handler function. Necessary so that we can get the nextApp instance.
function getItemRenderer (nextApp) {
  return (req, res) => {
    console.log('Express is handling request')
    const itemData = api.getItem()

    res.format({
      html: () => nextApp.render(req, res, '/item', { itemData }),
      json: () => res.json(itemData)
    })
  }
}

module.exports = { getItemRenderer }
