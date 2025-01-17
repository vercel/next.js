import { TodoList } from "./todo-list";
import { Form } from "./form";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto space-y-12 px-6 py-32">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-medium">Turso</h1>
        <p className="text-gray-500">Local SQLite with libSQL and Turso</p>
      </div>

      <div className="space-y-3">
        <TodoList />
        <Form />
      </div>
    </main>
  );
}
