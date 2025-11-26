"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/turso";

export const addTodo = async (formData: FormData) => {
  await db.execute({
    sql: "INSERT INTO todos (description) VALUES (?)",
    args: [formData.get("description") as string],
  });

  revalidatePath("/");
};

export const removeTodo = async (formData: FormData) => {
  await db.execute({
    sql: "DELETE FROM todos WHERE id = ?",
    args: [formData.get("id") as string],
  });

  revalidatePath("/");
};
