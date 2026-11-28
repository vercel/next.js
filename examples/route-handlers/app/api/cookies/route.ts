import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const visits = Number(cookieStore.get("visits")?.value ?? 0) + 1;

  cookieStore.set("visits", String(visits), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
  });

  return Response.json({ visits });
}
