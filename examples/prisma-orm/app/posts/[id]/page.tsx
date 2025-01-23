import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default async function Post({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id: parseInt(id) },
    include: {
      author: true,
    },
  });

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center text-[#333333] px-4">
      <article className="max-w-3xl space-y-4 font-[family-name:var(--font-barlow)] bg-white shadow-md p-6 rounded-lg">
        <h1 className="text-3xl font-bold text-gray-900">
          {post.title ?? "Untitled"}
        </h1>
        <div className="flex items-center space-x-4">
          <Image
            src="/avatar.png"
            alt={post.author.name ?? "Author image"}
            height={48}
            width={48}
            className="w-12 h-12 rounded-full"
          />
          <p className="text-gray-500 text-sm">by {post.author.name}</p>
        </div>
        <div className="prose prose-gray mt-4">
          {post.content || "No content available."}
        </div>
      </article>

      <Link
        href="/posts"
        className="mt-4 text-blue-500 hover:underline font-[family-name:var(--font-barlow)]"
      >
        Back to Posts
      </Link>
    </div>
  );
}
