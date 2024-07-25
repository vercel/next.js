import { type NextRequest, NextResponse } from "next/server";

// Helper function to validate post data
function validatePostData(data: {
  title: string;
  content: string;
  authorId: string;
}): boolean {
  return (
    typeof data.title === "string" &&
    typeof data.content === "string" &&
    typeof data.authorId === "string"
  );
}

// GET: Retrieve all posts
export async function GET() {
  const posts = [
    {
      id: "1",
      title: "First Post",
      content: "Content of the first post",
      authorId: "author123",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      title: "Second Post",
      content: "Content of the second post",
      authorId: "author456",
      createdAt: new Date().toISOString(),
    },
  ];

  return NextResponse.json({
    posts,
    total: posts.length,
  });
}

// POST: Create a new post
export async function POST(request: NextRequest) {
  const data = await request.json();

  if (!validatePostData(data)) {
    return NextResponse.json({ error: "Invalid post data" }, { status: 400 });
  }

  const newPost = {
    id: Date.now().toString(),
    ...data,
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json(newPost, { status: 201 });
}

// OPTIONS: Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
