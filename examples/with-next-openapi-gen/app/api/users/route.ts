import { NextRequest, NextResponse } from "next/server";
import { users } from "@/data/users";
import { CreateUserBody, UsersQuery } from "@/schemas/users";

/**
 * Get all users
 * @description Returns a list of users
 * @params UsersQuery
 * @response Users:List of users
 * @openapi
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { limit } = UsersQuery.parse({
    limit: searchParams.get("limit"),
  });

  const result = limit ? users.slice(0, limit) : users;
  return NextResponse.json(result);
}

/**
 * Create a user
 * @description Creates a new user
 * @body CreateUserBody
 * @response User:Created user
 * @openapi
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const userData = CreateUserBody.parse(body);

  const newUser = {
    id: (users.length + 1).toString(),
    ...userData,
  };

  users.push(newUser);
  return NextResponse.json(newUser, { status: 201 });
}
