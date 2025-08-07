import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/data/users";
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
  const user = userStore.getById(params.id);
  
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
  try {
    const body = await request.json();
    const updateData = UpdateUserBody.parse(body);
    
    const updatedUser = userStore.update(params.id, updateData);
    
    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    throw error;
  }
}

/**
 * Delete user
 * @description Deletes a user
 * @pathParams UserParams
 * @response 200:User:Deleted user data
 * @deprecated
 * @openapi
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const deletedUser = userStore.delete(params.id);
  
  if (!deletedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(deletedUser, { status: 200 });
}
