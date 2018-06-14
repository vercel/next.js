const serverless = require("serverless-http");

process.env.IN_LAMBDA = true;
process.env.NODE_ENV = "production";

const binaryMimeTypes = [
    "application/javascript",
    "application/json",
    "application/octet-stream",
    "application/xml",
    "binary/octet-stream",
    "image/jpeg",
    "image/png",
    "image/gif",
    "text/comma-separated-values",
    "text/css",
    "text/html",
    "text/javascript",
    "text/plain",
    "text/text",
    "text/xml",
    "image/x-icon",
    "image/svg+xml",
    "application/font-woff2",
    "application/font-woff",
    "font/woff",
    "font/woff2"
];

const appServer = require("./server");

const handler = serverless(appServer, {
    binary: binaryMimeTypes
});

exports.handler = (evt, ctx, callback) => handler(evt, ctx, callback);