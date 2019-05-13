// This function is the webhook's request handler.
exports = function(payload) {
    const request = EJSON.parse(payload.body.text());
    const http = context.services.get("<app-title>");
    const owner = context.values.get("<username-of-the-app-owner>");
    const apiKey = context.values.get("<api-key>");

    return http.post({
        url: "https://stitch.mongodb.com/api/admin/v3.0/auth/providers/mongodb-cloud/login",
        body: JSON.stringify({
            username: owner,
            apiKey: apiKey
        })
    }).then(response => EJSON.parse(response.body.text()).access_token).then(accessToken => {
        return http.post({
            url: "https://stitch.mongodb.com/api/admin/v3.0/groups/<group-id>/apps/<app-id>/users",
            headers: {
                Authorization: ["Bearer " + accessToken]
            },
            body: JSON.stringify({
                email: request.useremail,
                password: request.userpass
            })
        });
    });
};
