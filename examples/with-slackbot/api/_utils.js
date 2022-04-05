const axios = require('axios');
import { token } from './_constants';

export function tokenizeString(string) {
    const array = string.split(" ").filter(element => {
        return element !== ""
    })
    console.log("Tokenized version:", array)
    return array
}

export async function postToChannel(channel, res, payload) {

    console.log("channel:", channel)
    var channelId = await channelNameToId(channel)

    console.log("ID:", channelId)

    const message = {
        channel: channelId,
        text: payload,
    }

    axios({
        method: 'post',
        url: 'https://slack.com/api/chat.postMessage',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${token}` },
        data: message,
    })
        .then(response => {
            console.log("data from axios:", response.data)
            res.json({ ok: true })
        })
        .catch(err => {
            console.log("axios Error:", err)
            res.send({
                "response_type": "ephemeral",
                "text": `${err.response.data.error}`
            })
        })

}

async function channelNameToId(channelName) {
    var generalId
    var id
    await axios({
        method: 'post',
        url: 'https://slack.com/api/conversations.list',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${token}` },
    })
        .then(response => {
            response.data.channels.forEach(element => {

                if (element.name === channelName) {
                    id = element.id
                    return element.id
                }
                else if(element.name === "general") generalId = element.id
            });

            return generalId
        })
        .catch(err => {
            console.log("axios Error:", err)
        })

        return id
}