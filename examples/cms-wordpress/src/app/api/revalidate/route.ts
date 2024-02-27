import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

export async function PUT(request: NextRequest) {
  const requestBody = await request.text();
  const { paths, tags } = requestBody
    ? JSON.parse(requestBody)
    : { paths: [], tags: [] };
  let revalidated = false;

  // Check that secret key is correct
  if (
    request.headers.get("X-Headless-Secret-Key") !== process.env.HEADLESS_SECRET
  ) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  try {
    // Check that paths param exists and is an array and revalidate each path
    if (paths && Array.isArray(paths) && paths.length > 0) {
      Promise.all(paths.map((path) => revalidatePath(path)));
      console.log("Revalidated paths:", paths);
      revalidated = true;
    }

    // Check that tags param exists and is an array and revalidate each tag
    if (tags && Array.isArray(tags) && tags.length > 0) {
      Promise.all(tags.map((tag) => revalidateTag(tag)));
      console.log("Revalidated tags:", tags);
      revalidated = true;
    }

    // Return success response
    return NextResponse.json({
      revalidated,
      now: Date.now(),
      paths,
      tags: tags,
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Error revalidating paths or tags" },
      { status: 500 },
    );
  }
}
