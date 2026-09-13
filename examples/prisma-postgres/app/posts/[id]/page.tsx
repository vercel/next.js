export const dynamic = "force-dynamic"; // This disables SSG and ISR

import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";

export default async function Post({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const postId = parseInt(id);

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: true,
    },
  });

  if (!post) {
    notFound();
  }

  // Server action to delete the post
  async function deletePost() {
    "use server";

    await prisma.post.delete({
      where: {
        id: postId,
      },
    });

    redirect("/posts");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <article className="max-w-3xl w-full bg-card border border-border shadow-lg rounded-lg p-8">
        {/* Post Title */}
        <h1 className="text-5xl font-extrabold text-primary mb-4">
          {post.title}
        </h1>

        {/* Author Information */}
        <p className="text-lg text-foreground/70 mb-4">
          by{" "}
          <span className="font-medium text-foreground">
            {post.author?.name || "Anonymous"}
          </span>
        </p>

        {/* Content Section */}
        <div className="text-lg text-foreground leading-relaxed space-y-6 border-t border-border pt-6">
          {post.content ? (
            <p>{post.content}</p>
          ) : (
            <p className="italic text-foreground/70">
              No content available for this post.
            </p>
          )}
        </div>
      </article>

      {/* Delete Button */}
      <form action={deletePost} className="mt-6">
        <button
          type="submit"
          className="px-6 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
        >
          Delete Post
        </button>
      </form>
    </div>
  );
}
