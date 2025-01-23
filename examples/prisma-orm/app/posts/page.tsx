import prisma from "@/lib/prisma";
import Link from "next/link";
import Image from "next/image";

export default async function Posts() {
  const posts = await prisma.post.findMany({
    include: {
      author: true,
    },
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center text-[#333333] px-4">
      <h1 className="text-3xl font-bold mb-8 font-[family-name:var(--font-barlow)] text-gray-900">
        Posts
      </h1>
      <div className="font-[family-name:var(--font-barlow)] max-w-3xl bg-white shadow-md p-6 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post) => (
            <Link href={`/posts/${post.id}`} key={post.id} className="block">
              <div className="border border-gray-300 p-4 rounded-lg hover:bg-gray-50 transition-colors flex items-center">
                <Image
                  src="/avatar.png"
                  alt={post.author.name ?? "Author image"}
                  height={48}
                  width={48}
                  className="w-12 h-12 rounded-full mr-2"
                />
                <div>
                  <span className="block text-lg font-semibold text-gray-800">
                    {post.title}
                  </span>
                  <span className="text-sm text-gray-500 mt-1 inline-block">
                    by {post.author.name}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
      <Link
        href="/posts/new"
        className="mt-4 text-blue-500 hover:underline font-[family-name:var(--font-barlow)]"
      >
        Create new post
      </Link>
    </div>
  );
}
