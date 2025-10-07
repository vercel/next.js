export const dynamic = "force-dynamic"; // This disables SSG and ISR

import prisma from "@/lib/prisma";
import Link from "next/link";

export default async function Home() {
  const posts = await prisma.post.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 6,
    include: {
      author: {
        select: {
          name: true,
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center -mt-16 p-8">
      <h1 className="text-5xl font-extrabold mb-12 text-foreground">
        Recent Posts
      </h1>
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 w-full max-w-6xl">
        {posts &&
          posts.map((post) => (
            <Link key={post.id} href={`/posts/${post.id}`} className="group">
              <div className="border rounded-lg shadow-md bg-card border-border p-6 hover:shadow-lg transition-shadow duration-300">
                <h2 className="text-2xl font-semibold text-primary group-hover:underline mb-2">
                  {post.title}
                </h2>
                <p className="text-sm text-foreground/70">
                  by {post.author ? post.author.name : "Anonymous"}
                </p>
                <p className="text-xs text-foreground/70 mb-4">
                  {new Date(post.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <div className="relative">
                  <p className="text-foreground leading-relaxed line-clamp-2">
                    {post.content || "No content available."}
                  </p>
                  <div className="absolute bottom-0 left-0 w-full h-12 bg-linear-to-t from-background to-transparent" />
                </div>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}
