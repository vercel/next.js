import 'isomorphic-unfetch';

export const fetchPostsEndpoint = () => fetch(`https://webhooks.mongodb-stitch.com/api/client/v2.0/app/${process.env.APP_TITLE}/service/${process.env.STITCH_SERVICE}/incoming_webhook/${process.env.STITCH_WEBHOOK_GET_USERS}`);

export const fileUploadEndpoint = (picture, bucket, fileName, fileType) => fetch(`https://webhooks.mongodb-stitch.com/api/client/v2.0/app/${process.env.APP_TITLE}/service/${process.env.STITCH_SERVICE}/incoming_webhook/${process.env.STITCH_WEBHOOK_POST_PICTURE}`, {
    method: "POST",
    headers: {
        "Content-Type": "multipart/form-data"
    },
    body: JSON.stringify({
        picture,
        bucket,
        fileName,
        fileType
    })
});