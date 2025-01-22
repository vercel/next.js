import { FileObject, ListFileResponse } from "imagekit/dist/libs/interfaces";
import { Dispatch, SetStateAction } from "react";
import NavigateRightIcon from "./Icons/NavigateRightIcon";

const NavigateRightButton = ({
  images,
  currentIndex = 0,
  setCurrentIndex,
}: {
  images: ListFileResponse;
  currentIndex: number;
  setCurrentIndex: Dispatch<SetStateAction<number>>;
}) => {
  return (
    <>
      {currentIndex + 1 < images.length && (
        <button
          className="absolute right-10  rounded-full bg-black/50 p-3 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white focus:outline-none"
          onClick={() => {
            setCurrentIndex((prev) => prev + 1);
          }}
        >
          <NavigateRightIcon/>
        </button>
      )}
    </>
  );
};
export default NavigateRightButton;
