export const dynamic = "force-dynamic"; // This disables SSG and ISR

import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import Form from "next/form";

export default function NewUser() {
  async function createUser(formData: FormData) {
    "use server";

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;

    await prisma.user.create({
      data: { name, email },
    });

    redirect("/");
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md mt-12">
      <h1 className="text-3xl font-bold mb-6">Create New User</h1>
      <Form action={createUser} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-lg font-medium mb-2">
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            placeholder="Enter user name ..."
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label
            htmlFor="email"
            className="flex text-lg font-medium mb-2 items-center"
          >
            Email
            <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-gray-500 rounded-lg">
              Required
            </span>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            placeholder="Enter user email ..."
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600"
        >
          Create User
        </button>
      </Form>
    </div>
  );
}
