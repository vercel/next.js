import prisma from "@/lib/prisma";

export default async function Posts() {
  const posts = await prisma.post.findMany({
    include: {
      author: true,
    },
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center text-[#333333] px-4">
      <h1 className="text-5xl font-bold mb-10 font-[family-name:var(--font-geist-sans)] text-gray-900">
        Posts
      </h1>
      <ul className="font-[family-name:var(--font-geist-sans)] max-w-3xl space-y-6 bg-white shadow-lg p-6 rounded-lg">
        {posts.map((post) => (
          <li key={post.id} className="border-b border-gray-300 pb-4 last:border-none">
            <span className="block text-xl font-semibold text-gray-800">{post.title}</span>
            <span className="text-sm text-gray-500 mt-1 inline-block">
              by {post.author.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}