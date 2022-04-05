const axios = require('axios')
import { redisURL, redisToken } from '../_constants'

export async function addToList(res, commandArray) {

    let listName = commandArray[1]

    let value = ""

    for (let i = 2; i < commandArray.length; i++) {
        value += commandArray[i] + " ";
    }

    await axios({
        url: `${redisURL}/RPUSH/${listName}/${value}`,
        headers: {
            "Authorization": `Bearer ${redisToken}`
        }
    })
        .then(response => {
            console.log("data from axios:", response.data)
            res.send({
                "response_type": "in_channel",
                "text": `Successfully added "${value}" to list: "${listName}".`
            })
        })
        .catch(err => {
            console.log("axios Error:", err)
            res.send({
                "response_type": "ephemeral",
                "text": `${err.response.data.error}`
            })
        })

}

