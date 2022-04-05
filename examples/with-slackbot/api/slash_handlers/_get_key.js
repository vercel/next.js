const axios = require('axios')
import { redisURL, redisToken } from '../_constants'

export async function getKey(res, commandArray) {

    let key = commandArray[1]

    await axios({
        url: `${redisURL}/get/${key}`,
        headers: {
            "Authorization": `Bearer ${redisToken}`
        }
    })
        .then(response => {
            console.log("data from axios:", response.data)
            res.send({
                "response_type": "in_channel",
                "text": `Value for "${key}": "${response.data.result}"`
            })
        })
        .catch(err => {
            console.log("axios Error:", err.response.data.error)
            res.send({
                "response_type": "ephemeral",
                "text": `${err.response.data.error}`
            })
        })

}

