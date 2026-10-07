"use client";

import { observer } from "@legendapp/state/react";
import NewTask from "@/components/NewTask";
import TaskList from "@/components/TaskList";

const Home = observer(() => {
  return (
    <>
      <div className="fixed top-0 left-0 w-full pointer-events-none">
        <h1 className="p-4 text-2xl whitespace-nowrap sm:text-6xl md:text-7xl font-mono lg:text-8xl xl:text-9xl transition-all duration-500 ease-mobai-bounce text-mobai-foreground font-bold sm:rotate-90 origin-bottom-left">
          Task Demo
        </h1>
      </div>
      <div className="pt-10 sm:pt-4 transition-all duration-500 ease-mobai-bounce w-full">
        <div className="max-w-xl lg:max-w-2xl transition-all duration-500 ease-mobai-bounce mx-auto p-4">
          <div>
            <NewTask />
            <TaskList />
          </div>
        </div>
      </div>
    </>
  );
});

export default Home;
