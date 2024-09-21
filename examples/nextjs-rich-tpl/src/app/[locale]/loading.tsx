import React from "react";
import LoaderRo13 from "@/components/ui/loaderro13";

function Loading() {
  return (
    <div className="flex justify-center items-center w-full h-full">
      <LoaderRo13 time={-1} />
    </div>
  );
}

export default Loading;
