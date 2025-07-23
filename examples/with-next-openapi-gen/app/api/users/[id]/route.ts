import { NextRequest, NextResponse } from "next/server";
import { users } from "@/data/users";
import { UpdateUserBody } from "@/schemas/users";

/**
 * Get user by ID
 * @description Returns a specific user
 * @pathParams UserParams
 * @response User:Retrieve user
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = users.find((u) => u.id === params.id);
  
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

/**
 * Update user
 * @description Updates a user
 * @pathParams UserParams
 * @body UpdateUserBody
 * @response User:Updated user
 * @openapi
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const updateData = UpdateUserBody.parse(body);
  
  const userIndex = users.findIndex((u) => u.id === params.id);
  
  if (userIndex === -1) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  users[userIndex] = { ...users[userIndex], ...updateData };
  return NextResponse.json(users[userIndex]);
}

/**
 * Delete user
 * @description Deletes a user
 * @pathParams UserParams
 * @response 200:User:Deleted user data
 * @openapi
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userIndex = users.findIndex((u) => u.id === params.id);
  
  if (userIndex === -1) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const deletedUser = users.splice(userIndex, 1)[0];
  return NextResponse.json(deletedUser, { status: 200 });
}
