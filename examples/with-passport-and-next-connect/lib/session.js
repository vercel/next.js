import { parse, serialize } from "cookie";
import { createLoginSession, getLoginSession } from "./auth";

function parseCookies(req) {
  if (req.cookies) return req.cookies;
  const cookie = req.headers?.cookie;
  return parse(cookie || "");
}

export default function session({ name, secret, cookie: cookieOpts }) {
  return async (req, res, next) => {
    const cookies = parseCookies(req);
    const token = cookies[name];
    let unsealed = {};

    if (token) {
      try {
        unsealed = await getLoginSession(token, secret);
      } catch (e) {
        // The cookie is invalid
      }
    }

    req.session = unsealed;

    // Middleware to handle response end
    const originalEnd = res.end;
    res.end = function(...args) {
      if (res.finished || res.writableEnded || res.headersSent) return;

      // Handle session asynchronously before ending the response
      (async () => {
        if (cookieOpts.maxAge) {
          req.session.maxAge = cookieOpts.maxAge;
        }

        const token = await createLoginSession(req.session, secret);
        res.setHeader("Set-Cookie", serialize(name, token, cookieOpts));
        originalEnd.apply(res, args);
      })().catch(err => {
        console.error('Error handling session:', err);
        originalEnd.apply(res, args);
      });
    };

    next();
  };
}
