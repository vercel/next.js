import { NextApiRequest, NextApiResponse } from "next";
import { Session, withIronSession } from "next-iron-session";

type NextIronRequest = NextApiRequest & { session: Session };

type APIHandler = (
  req: NextIronRequest,
  res: NextApiResponse<any>,
) => Promise<any>;

export type ServerSideProps = ({
  req,
}: {
  req: NextIronRequest;
}) => Promise<any>;

const withSession = (handler: APIHandler | ServerSideProps) =>
  withIronSession(handler, {
    password: process.env.IRON_SESSION_PASSWORD || "",
    cookieName: process.env.IRON_SESSION_COOKIE_NAME || "",
    // if your localhost is served on http:// then disable the secure flag
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    },
  });

export default withSession;
