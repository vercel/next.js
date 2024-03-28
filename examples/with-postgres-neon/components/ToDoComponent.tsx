import React from "react";
interface ToDoProps {
  key: number;
  text: string;
  done: boolean;
  onChange: () => void;
  onRemove: () => void;
}
const ToDoComponent: React.FC<ToDoProps> = (props) => {
  return (
    <div className="flex flex-row gap-2 justify-between items-center">
      <div
        style={{ textDecoration: props.done ? "line-through" : "" }}
        className="text-lg"
      >
        {props.text}
      </div>
      <div className="flex flex-row gap-4 items-center">
        <input
          type="checkbox"
          checked={props.done}
          onChange={props.onChange}
          className="border-gray-300 rounded h-5 w-5"
        />
        <button
          onClick={props.onRemove}
          className="border-gray-300 rounded h-5 w-5"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
};

export default ToDoComponent;
