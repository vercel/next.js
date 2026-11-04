import { db } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const postsPerPage = 5;
  const offset = (page - 1) * postsPerPage;

  // Fetch paginated posts
  const posts = await db.orm.public.Post.include("author")
    .orderBy((post) => post.createdAt.desc())
    .limit(postsPerPage)
    .offset(offset)
    .all();

  const { totalPosts } = await db.orm.public.Post.aggregate((a) => ({
    totalPosts: a.count(),
  }));
  const totalPages = Math.ceil(totalPosts / postsPerPage);

  return NextResponse.json({ posts, totalPages });
}
