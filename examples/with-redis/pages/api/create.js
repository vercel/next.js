import Redis from 'ioredis'
import {fixUrl} from "./utils";

module.exports = async (req, res) => {
    let redis = new Redis(fixUrl(process.env.REDIS_URL));
    const body = req.body;
    const title = body["title"];
    if (!title) {
        redis.quit()
        res.json({
            error: "Feature can not be empty"
        })
    } else if (title.length < 70) {
        await redis.zadd("roadmap", "NX", 1, title);
        redis.quit()
        res.json({
            body: "success"
        })
    } else {
        redis.quit()
        res.json({
            error: "Max 70 characters please."
        })
    }
}
