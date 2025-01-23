import Form from "next/form";
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
        authorId: 1,
      },
    });

    revalidatePath("/posts");
    redirect("/posts");
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center text-[#333333] px-4">
      <h1 className="text-4xl font-bold mb-8 font-[family-name:var(--font-geist-sans)]">
        Create new post
      </h1>
      <Form
        action={createPost}
        className="w-full max-w-3xl bg-white shadow-lg p-6 rounded-lg space-y-6"
      >
        <div>
          <label htmlFor="title" className="block text-lg mb-2 text-gray-700">
            Title
          </label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Enter your post title"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="content" className="block text-lg mb-2 text-gray-700">
            Content
          </label>
          <textarea
            id="content"
            name="content"
            placeholder="Write your post content here..."
            rows={6}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-gray-800 text-white py-3 rounded-lg hover:bg-gray-900 transition-colors"
        >
          Create Post
        </button>
      </Form>
    </div>
  );
}
