import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/data/users";
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

  const allUsers = userStore.getAll();
  const result = limit ? allUsers.slice(0, limit) : allUsers;
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
  try {
    const body = await request.json();
    const userData = CreateUserBody.parse(body);

    const newUser = userStore.create(userData);
    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    throw error;
  }
}
