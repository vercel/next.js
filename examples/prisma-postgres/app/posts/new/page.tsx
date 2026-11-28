export const dynamic = "force-dynamic"; // This disables SSG and ISR

import Form from "next/form";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export default function NewPost() {
  async function createPost(formData: FormData) {
    "use server";

    const authorEmail = (formData.get("authorEmail") as string) || undefined;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;

    if (!authorEmail) {
      throw new Error("Author email is required");
    }

    await prisma.post.create({
      data: {
        title,
        content,
        author: {
          connect: { email: authorEmail },
        },
      },
    });

    revalidatePath("/posts");
    redirect("/posts");
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-foreground">
        Create New Post
      </h1>
      <Form action={createPost} className="space-y-6">
        <div>
          <label
            htmlFor="title"
            className="flex text-lg font-medium mb-2 items-center"
          >
            Title
            <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-foreground/70 rounded-lg">
              Required
            </span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            placeholder="Enter your post title ..."
            className="w-full px-4 py-2 border border-border bg-card text-foreground rounded-lg"
          />
        </div>
        <div>
          <label htmlFor="content" className="block text-lg font-medium mb-2">
            Content
          </label>
          <textarea
            id="content"
            name="content"
            placeholder="Write your post content here ..."
            rows={6}
            className="w-full px-4 py-2 border border-border bg-card text-foreground rounded-lg"
          />
        </div>
        <div>
          <label
            htmlFor="authorEmail"
            className="block text-lg font-medium mb-2"
          >
            Author
          </label>
          <input
            type="text"
            id="authorEmail"
            name="authorEmail"
            placeholder="Enter the email of the author here ..."
            required
            className="w-full px-4 py-2 border border-border bg-card text-foreground rounded-lg"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-primary text-white py-3 rounded-lg hover:brightness-110"
        >
          Create Post
        </button>
      </Form>
    </div>
  );
}
