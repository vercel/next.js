import Head from "next/head";
import { useEffect, useState } from "react";
import { ToDo } from "@/lib/crud";
import ToDoComponent from "@/components/ToDoComponent";

export default function Home() {
  const [newText, setNewText] = useState("");
  const [toDos, setToDos] = useState<ToDo[]>([]);

  const getToDos = async () => {
    const resp = await fetch("api/todos");
    const toDos = await resp.json();
    setToDos(toDos);
  };

  const createToDo = async () => {
    await fetch("api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newText }),
    });

    setNewText("");

    await getToDos();
  };

  const updateToDo = async (todo: ToDo) => {
    const newBody = {
      id: todo.id,
      done: !todo.done,
    };

    await fetch("api/todos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newBody),
    });

    await getToDos();
  };

  const removeToDo = async (todo: ToDo) => {
    const newBody = {
      id: todo.id,
    };

    await fetch("api/todos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newBody),
    });

    await getToDos();
  };

  useEffect(() => {
    getToDos();
  }, []);

  const done = toDos.filter((todo) => todo.done);
  const undone = toDos.filter((todo) => !todo.done);
  return (
    <>
      <Head>
        <title>neon + next.js + tailwindcss</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="bg-base-100 min-h-screen flex items-center justify-center">
        <div className="bg-base-50 flex flex-col md:flex-row rounded-2xl shadow-xl md:w-1/2 p-5  gap-8">
          <div className="block w-full md:w-1/2 h-full ">
            <div className="flex flex-col gap-2 w-full mb-2">
              <div className="text-lg uppercase font-bold text-center">
                to dos
              </div>
              <div className="flex flex-row gap-2">
                <input
                  value={newText}
                  className="peer h-10 w-full rounded-md bg-gray-50 px-4 font-thin outline-none drop-shadow-sm transition-all duration-200 ease-in-out focus:bg-white focus:drop-shadow-lg"
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => e.code === "Enter" && createToDo()}
                ></input>
                <button
                  className="w-10 h-10  border rounded-md"
                  onClick={createToDo}
                >
                  &#10011;
                </button>
              </div>
            </div>
            <div>
              {undone.map((todo, index) => (
                <ToDoComponent
                  key={todo.id}
                  text={`${index + 1}. ${todo.text}`}
                  done={todo.done}
                  onChange={() => updateToDo(todo)}
                  onRemove={() => removeToDo(todo)}
                />
              ))}
            </div>
          </div>

          <div className="block w-full md:w-1/2 h-full gap-2">
            <div className="flex flex-col  w-full">
              <div className="text-lg uppercase font-bold text-center">
                done
              </div>
            </div>
            <div>
              {done.map((todo, index) => (
                <ToDoComponent
                  key={todo.id}
                  text={`${index + 1}. ${todo.text}`}
                  done={todo.done}
                  onChange={() => updateToDo(todo)}
                  onRemove={() => removeToDo(todo)}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
