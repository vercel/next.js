import { NextRequest, NextResponse } from "next/server";

interface BasicAuthMiddlewareCredentials {
  username: string;
  password: string;
}

type BasicAuthMiddlewareCheck = (
  credentials: BasicAuthMiddlewareCredentials
) => boolean;

const createMiddleware = (check: BasicAuthMiddlewareCheck) => {
  return (req: NextRequest) => {
    const basicAuthHeader = req.headers.get("authorization");

    if (basicAuthHeader) {
      const credentials = parseHeader(basicAuthHeader);
      const isValid = check(credentials);

      if (isValid) {
        return NextResponse.next();
      }
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("www-authenticate", 'Basic realm="Site"');

    const url = `${req.nextUrl.protocol}//${req.nextUrl.host}/401`;
    return NextResponse.rewrite(url, {
      status: 401,
      headers: requestHeaders,
    });
  };
};

const parseHeader = (headerVal: string) => {
  const authValue = headerVal.split(" ")[1];
  const [username, password] = Buffer.from(authValue, "base64")
    .toString()
    .split(":");

  return {
    username,
    password,
  };
};

const basicAuth = { createMiddleware };

export default basicAuth;
