import Redis from 'ioredis'
import {fixUrl} from "./utils";

module.exports = async(req, res) => {
    let redis = new Redis(fixUrl(process.env.REDIS_URL));

    const body = req.body
    const title = body["title"];
    let ip = req.headers["x-forwarded-for"] || req.headers["Remote_Addr"] || "NA";
    let c = ip === "NA" ? 1 : await redis.sadd("s:" + title, ip);
    if(c === 0) {
        redis.quit();
        res.json({
            error: "You can not vote an item multiple times"
        })
    } else {
        let v = await redis.zincrby("roadmap", 1, title);
        redis.quit();
        res.json({
            body: v
        })
    }
}

