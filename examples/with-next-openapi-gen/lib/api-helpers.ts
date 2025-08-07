import { NextResponse } from "next/server";
import { z } from "zod";

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid JSON in request body" }, 
      { status: 400 }
    );
  }
  
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { 
        error: "Validation failed", 
        details: error.flatten().fieldErrors 
      }, 
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: "Internal server error" }, 
    { status: 500 }
  );
}
