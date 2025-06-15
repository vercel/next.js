import { NextRequest, NextResponse } from "next/server";
import { WorkflowClient } from "@temporalio/client";
import { order } from "../../../temporal/src/workflows";

export type Data = {
  result: string;
};

function getUserId(token?: string): string {
  // TODO if the token is a JWT, decode & verify it. If it's a session ID,
  // look up the user's ID in the session store.
  return "user-id-123";
}

export async function POST(req: NextRequest) {
  try {
    const authHeader: any = req.headers.get("authorization");
    const userId: string = getUserId(authHeader);

    const body = await req.json();
    const { itemId, quantity } = body;

    // Connect to our Temporal Server running locally in Docker
    const client = new WorkflowClient();

    // Execute the order Workflow and wait for it to finish
    const result = await client.execute(order, {
      taskQueue: "my-nextjs-project",
      workflowId: "my-business-id",
      args: [userId, itemId, quantity],
    });

    return NextResponse.json({ result });
  } catch (error:any) {
    return NextResponse.json(
      { result: `Error: ${error.message}` },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json(
    { result: "Error code 405: use POST" },
    { status: 405 }
  );
}
