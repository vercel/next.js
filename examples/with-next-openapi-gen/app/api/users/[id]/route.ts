import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/data/users";
import { UpdateUserBody, UserParams } from "@/schemas/users";
import { handleApiError } from "@/lib/api-helpers";

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
  try {
    const { id } = UserParams.parse(params);
    const user = userStore.getById(id);
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error);
  }
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
    const { id } = UserParams.parse(params);
    const body = await request.json();
    const updateData = UpdateUserBody.parse(body);
    
    const updatedUser = userStore.update(id, updateData);
    
    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    return handleApiError(error);
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
  try {
    const { id } = UserParams.parse(params);
    const deletedUser = userStore.delete(id);
    
    if (!deletedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(deletedUser, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
