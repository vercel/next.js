import Form from "next/form";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default function NewPost() {
  async function createPost(formData: FormData) {
    "use server";

    const title = formData.get("title") as string;
    const content = formData.get("content") as string;

    await prisma.post.create({
      data: {
        title,
        content,
        authorId: 1, // In a real app, you'd get the authorId from the session
      },
    });

    revalidatePath("/posts");
    redirect("/posts");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center text-[#333333] px-4">
      <h1 className="text-3xl font-bold mb-8 font-[family-name:var(--font-barlow)]">
        Create new post
      </h1>
      <Form
        action={createPost}
        className="w-full max-w-3xl bg-white shadow-md p-6 rounded-lg space-y-6 font-[family-name:var(--font-barlow)]"
      >
        <div>
          <label
            htmlFor="title"
            className="block text-base font-medium mb-2 text-gray-700"
          >
            Title
          </label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Enter your post title"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="content"
            className="block text-base font-medium mb-2 text-gray-700"
          >
            Content
          </label>
          <textarea
            id="content"
            name="content"
            placeholder="Write your post content here..."
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
        >
          Create Post
        </button>
      </Form>

      <Link
        href="/posts"
        className="mt-4 text-blue-500 hover:underline font-[family-name:var(--font-barlow)]"
      >
        Back to Posts
      </Link>
    </div>
  );
}
