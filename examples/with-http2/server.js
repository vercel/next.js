const next = require("next");
const http2 = require("node:http2");
const { parse } = require("node:url");
const fs = require("node:fs");

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== "production";

// Init the Next app:
const app = next({ dev });

// Create the secure HTTPS server:
// Don't forget to create the keys for your development
const server = http2.createSecureServer({
  key: fs.readFileSync("localhost-privkey.pem"),
  cert: fs.readFileSync("localhost-cert.pem"),
});

const handler = app.getRequestHandler();

app.prepare().then(() => {
  server.on("error", (err) => console.error(err));
  server.on("request", (req, res) => {
    const parsedUrl = parse(req.url, true);
    handler(req, res, parsedUrl);
  });
  server.listen(port);

  console.log(`Listening on HTTPS port ${port}`);
});
