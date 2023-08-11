import { Roles, schema } from "@/lib/acl";

export async function GET(
  request: Request,
  { params }: { params: { role: Roles } }
) {
  const role = params.role;
  const exists = schema.exists(role);
  if (!exists) {
    return new Response("Role not found", { status: 404 });
  }
  const permissions = schema.toJSON(role as "admin" | "editor" | "viewer");
  return new Response(permissions, { status: 200 });
}
