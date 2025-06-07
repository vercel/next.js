import Check from "@/components/icons/Check";
import Circle from "@/components/icons/Circle";
import { Tables } from "@/lib/types";
import { toggleDone } from "@/lib/store";

const TaskItem = ({ task }: { task: Tables<"tasks"> }) => {
  const handlePress = () => {
    toggleDone(task.id);
  };
  return (
    <li className="bg-mobai-foreground p-3 sm:p-4 transition-all duration-500 ease-mobai-bounce">
      <button
        onClick={handlePress}
        className="flex flex-row justify-between w-full items-center"
      >
        <p className="text-mobai-background font-bold">{task.text}</p>
        <p>
          {task.done ? (
            <Check className="size-6" />
          ) : (
            <Circle className="size-6" />
          )}
        </p>
      </button>
    </li>
  );
};

export default TaskItem;
