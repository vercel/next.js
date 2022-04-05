import { tokenizeString } from './_utils'
import { setKey } from './slash_handlers/_set_key'
import { addToList } from './slash_handlers/_add_to_list'
import { listAll } from './slash_handlers/_list_all'
import { getKey } from './slash_handlers/_get_key'
import { removeFromList } from './slash_handlers/_remove_from_list'

module.exports = (req, res) => {

  const commandArray = tokenizeString(req.body.text)
  const action = commandArray[0]

  switch (action) {
    case "set": setKey(res, commandArray); break
    case "get": getKey(res, commandArray); break    
    case "list-set": addToList(res, commandArray); break
    case "list-all": listAll(res, commandArray); break
    case "list-remove": removeFromList(res, commandArray); break 
    default:
      res.send({
        "response_type": "ephemeral",
        "text": "Wrong usage of the command!"
      })
  }
}