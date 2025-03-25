import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const postsPerPage = 5;
  const offset = (page - 1) * postsPerPage;

  // Fetch paginated posts
  const posts = await prisma.post.findMany({
    skip: offset,
    take: postsPerPage,
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  const totalPosts = await prisma.post.count();
  const totalPages = Math.ceil(totalPosts / postsPerPage);

  return NextResponse.json({ posts, totalPages });
}
