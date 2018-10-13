// tslint:disable:no-floating-promises
import { createServer } from "http";
import * as next from "next";
import * as pathMatch from "path-match";
import { parse } from "url";

const dev = process.env.NODE_ENV !== "production";
const port = process.env.PORT || 3000;
const ROOT_URL = dev
  ? `http://localhost:${port}`
  : "https://with-shopify-api-typescript.now.sh";

const app = next({ dev });
const handle = app.getRequestHandler();
const route = pathMatch();
const matchProduct = route("/product/:id");

app.prepare().then(() => {
  createServer((req, res) => {
    const { pathname, query } = parse(req.url!, true);
    const params = matchProduct(pathname);
    if (params === false) {
      handle(req, res);
      return;
    }
    // assigning `query` into the params means that we still
    // get the query string passed to our application
    // i.e. /product/foo?bar=true
    app.render(req, res, "/product", { ...params, ...query });
  })
  .listen(port, (err) => {
    if (err) {
      throw err;
    }
    console.log(`> Ready on ${ROOT_URL}`);
  });
});
