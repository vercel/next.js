import { createServer } from "http";
import mobxReact from "mobx-react";
import next from "next";
import { parse } from "url";

const envPort = parseInt(process.env.PORT as string, 10) || 3000;
const dev = process.env.NODE_ENV !== "production";

mobxReact.useStaticRendering(true);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url as string, true);
    handle(req, res, parsedUrl)
      .catch((error) => { throw(error); });
  }).listen((port, err) => {
    if (err) {
      throw err;
    }
    console.log(`> Ready on http://localhost:${port}`);
  });
}).catch((error) => { throw(error); });
