"use client";

import { addTask } from "@/lib/store";
import React, { useState } from "react";

const NewTask = () => {
  const [text, setText] = useState("");
  const handleSubmitEditing = () => {
    setText("");
    addTask(text);
  };
  return (
    <div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleSubmitEditing();
          }
        }}
        className="text-mobai-foreground border-mobai-foreground border-2 transition-all duration-500 ease-mobai-bounce font-bold w-full outline-none p-3 sm:p-4 hover:bg-mobai-foreground hover:text-mobai-background"
      />
    </div>
  );
};

export default NewTask;
