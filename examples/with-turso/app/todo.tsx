"use client";

import { removeTodo } from "./actions";

export type TodoItem = {
  id: number;
  description: string;
};

export function Todo({ item }: { item: TodoItem }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-gray-100 p-3">
      <div className="flex w-full items-center space-x-3">
        {item.description}
      </div>
      <form action={removeTodo}>
        <button name="id" className="p-1 text-3xl" value={item.id}>
          &times;
        </button>
      </form>
    </li>
  );
}
