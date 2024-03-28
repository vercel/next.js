"use client";

import { useTransition } from "react";

import { removeTodo } from "./actions";

export type TodoItem = {
  id: number;
  description: string;
};

export function Todo({ item }: { item: TodoItem }) {
  const [_, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between rounded-md border border-gray-100 p-3">
      <div className="flex w-full items-center space-x-3">
        {item.description}
      </div>
      <button
        className="p-1 text-3xl"
        onClick={() => {
          startTransition(() => {
            removeTodo(item.id);
          });
        }}
      >
        &times;
      </button>
    </li>
  );
}
