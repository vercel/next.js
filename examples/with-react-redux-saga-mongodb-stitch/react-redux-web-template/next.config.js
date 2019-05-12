const { parsed: localEnv } = require('dotenv').config();
const webpack = require('webpack');

module.exports = {
    webpack(config) {
        config.plugins.push(new webpack.EnvironmentPlugin(localEnv));

        return config
    },
    target: 'serverless',
    env: {
        "APP_TITLE": "paste stitch app title here",
        "STITCH_SERVICE": "paste stitch service title here",
        "STITCH_WEBHOOK_GET_USERS": "paste webhook for certain api",
        "STITCH_WEBHOOK_POST_PICTURE": "another webhook",
        "AWS_S3_BUCKET": "paste aws s3 bucket title over here"
    }
};