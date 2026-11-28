import { users } from "@/lib/users";

export function GET() {
  return Response.json(users);
}
