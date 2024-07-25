import { type NextRequest, NextResponse } from "next/server";

// Helper function to validate post data
function validatePostData(data: { title: string; content: string; authorId: string }): boolean {
  return typeof data.title === "string" && typeof data.content === "string" && typeof data.authorId === "string";
}

// GET: Retrieve a post by ID
export async function GET(request: NextRequest, { params }: { params: { postId: string } }) {
  const postId = params.postId;

  // In a real app, you'd fetch the post from a database
  const post = {
    id: postId,
    title: "Sample Post",
    content: "This is a sample post content.",
    authorId: "author123",
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json(post);
}

// PUT: Update an existing post
export async function PUT(request: NextRequest, { params }: { params: { postId: string } }) {
  const postId = params.postId;
  const data = await request.json();

  if (!validatePostData(data)) {
    return NextResponse.json({ error: "Invalid post data" }, { status: 400 });
  }

  // In a real app, you'd update the post in a database
  const updatedPost = {
    id: postId,
    ...data,
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(updatedPost);
}

// DELETE: Remove a post
export async function DELETE(request: NextRequest, { params }: { params: { postId: string } }) {
  const postId = params.postId;

  // In a real app, you'd delete the post from a database
  // Here, we'll just return a success message
  return NextResponse.json({ message: `Post ${postId} deleted successfully` });
}
