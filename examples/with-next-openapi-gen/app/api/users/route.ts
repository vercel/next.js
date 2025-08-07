import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/data/users";
import { CreateUserBody, UsersQuery } from "@/schemas/users";
import { handleApiError } from "@/lib/api-helpers";

/**
 * Get all users
 * @description Returns a list of users
 * @params UsersQuery
 * @response Users:List of users
 * @openapi
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit } = UsersQuery.parse({
      limit: searchParams.get("limit"),
    });

    const allUsers = userStore.getAll();
    const result = limit ? allUsers.slice(0, limit) : allUsers;
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
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
    return handleApiError(error);
  }
}
