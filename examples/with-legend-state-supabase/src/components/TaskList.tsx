"use client";

import { tasks$ } from "@/lib/store";
import { Tables } from "@/lib/types";
import TaskItem from "@/components/TaskItem";
import { useEffect, useState } from "react";
import { observer } from "@legendapp/state/react";

const TaskList = observer(() => {
  const [isClient, setIsClient] = useState(false);
  const tasks = tasks$.get();
  const taskArray = Object.values(tasks || {}).reverse();

  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    isClient &&
    tasks && (
      <ul className="flex flex-col gap-4 py-4">
        {taskArray.map((task: Tables<"tasks">) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </ul>
    )
  );
});

export default TaskList;
