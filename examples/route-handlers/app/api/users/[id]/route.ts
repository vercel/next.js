import { findUser } from "@/lib/users";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/users/[id]">,
) {
  const { id } = await ctx.params;
  const user = findUser(id);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json(user);
}

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/users/[id]">,
) {
  const { id } = await ctx.params;
  const user = findUser(id);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name) {
    return Response.json(
      { error: "Expected a JSON body with a name" },
      { status: 400 },
    );
  }

  // The data is in memory, so return the updated user without storing it.
  return Response.json({ ...user, name });
}
