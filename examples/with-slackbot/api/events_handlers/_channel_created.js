import { postToChannel } from "../_utils"


export async function channel_created(req, res) {
    let event = req.body.event

    try {
        await postToChannel("general", res, `A new channel created with name \`${event.channel.name}\`!`)
    }
    catch (e) {
        console.log(e)
    }
}