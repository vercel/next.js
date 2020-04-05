import { serialize } from "cookie";

import { magic } from "../../../magic";

const isLocalhost = (host) => {
  return host === "localhost:3000";
};

/**
 * Get url from req in getInitialProps
 * @param req
 * @param localhostAddress
 */
const absoluteUrl = (req, localhostAddress = "localhost:3000") => {
    let host =
      (req?.headers ? req.headers.host : window.location.host) ||
      localhostAddress;
    let protocol = /^localhost(:\d+)?$/.test(host) ? "http:" : "https:";
  
    if (
      req &&
      req.headers["x-forwarded-host"] &&
      typeof req.headers["x-forwarded-host"] === "string"
    ) {
      host = req.headers["x-forwarded-host"];
    }
  
    if (
      req &&
      req.headers["x-forwarded-proto"] &&
      typeof req.headers["x-forwarded-proto"] === "string"
    ) {
      protocol = `${req.headers["x-forwarded-proto"]}:`;
    }
  
    return {
      protocol,
      host,
      origin: protocol + "//" + host
    };
  };
  

export default async function login(req, res) {
  try {
    const DIDToken = req.headers.authorization.substr(6);
    const issuer = magic.token.getIssuer(DIDToken);
    const metadata = await magic.users.getMetadataByIssuer(issuer);
    if (!metadata) {
      throw new Error("No metadata from magic");
    }
    const { host } = absoluteUrl(req);
    const parsedHost = isLocalhost(host) ? "localhost" : host;
    const cookieOptions = {
      expires: new Date(3600000 * 24 * 14 + Date.now()),
      domain: parsedHost,
      path: "/",
      httpOnly: !isLocalhost(host),
      secure: !isLocalhost(host),
      samesite: "Strict"
    };
    const coolcookie = serialize(
      "coolcookie",
      issuer,
      cookieOptions
    );
    res.setHeader("Set-Cookie", coolcookie);
    res.end();
  } catch (error) {
    res.status(error.status || 500).end(error.message);
  }
}
