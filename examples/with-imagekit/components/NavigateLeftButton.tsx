import { Dispatch, SetStateAction } from "react";
import NavigateLeftIcon from "./Icons/NavigateLeftIcon";

interface NavigateLeftButtonProps {
  currentIndex: number;
  setCurrentIndex: Dispatch<SetStateAction<number>>;
}

export default function NavigateLeftButton({
  currentIndex = 0,
  setCurrentIndex,
}: NavigateLeftButtonProps) {
  return (
    <>
      {currentIndex !== 0 && (
        <button
          className={`absolute left-10 rounded-full bg-black/50 p-3 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white focus:outline-none z-[1]`}
          onClick={() => {
            setCurrentIndex((prev) => prev - 1);
          }}
        >
          <NavigateLeftIcon />
        </button>
      )}
    </>
  );
}
