import { Roles, acl, schema } from "@/lib/acl";

type Payload = {
  role: Roles;
};

export async function PUT(request: Request) {
  const payload = (await request.json()) as Payload;
  const role = payload.role;
  const exists = schema.exists(role);
  if (!exists) {
    return new Response("Role not found", { status: 404 });
  }
  try {
    // let's use a role from the defined schema
    const isAuthorized = await acl.checkFn({
      resources: "posts",
      actions: "update",
      role: role as "admin" | "editor" | "viewer",
      strict: true,
    });
    if (!isAuthorized) {
      return new Response("Unauthorized", { status: 403 });
    }
    return new Response("OK", { status: 200 });
  } catch {
    return new Response("Unauthorized", { status: 403 });
  }
}

export async function DELETE(request: Request) {
  const payload = (await request.json()) as Payload;
  const role = payload.role;
  const exists = schema.exists(role);
  if (!exists) {
    return new Response("Role not found", { status: 404 });
  }
  try {
    // let's construct the role from role object
    // in case you want to get a role saved in a data source
    const isAuthorized = await acl.checkFn({
      resources: "posts",
      actions: "delete",
      strict: true,
      construct: true,
      data: schema.toObject(role as "admin" | "editor" | "viewer"),
    });
    if (!isAuthorized) {
      return new Response("Unauthorized", { status: 403 });
    }
    return new Response("OK", { status: 200 });
  } catch {
    return new Response("Unauthorized", { status: 403 });
  }
}
