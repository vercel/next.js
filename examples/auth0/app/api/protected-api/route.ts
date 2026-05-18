import { getSession, withApiAuthRequired } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

const GET = withApiAuthRequired(async function handler() {
  const session = await getSession();
  const user = session?.user;

  return NextResponse.json({
    session: "true",
    id: user?.sub,
    nickname: user?.nickname,
  });
});

export { GET };
