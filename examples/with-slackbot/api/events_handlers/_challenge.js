export function challenge(req, res) {
    console.log("req body challenge is:", req.body.challenge)

    res.status(200).send({
        "challenge": req.body.challenge
    })
}