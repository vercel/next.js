import { FileObject } from "imagekit/dist/libs/interfaces";
import { Dispatch, SetStateAction } from "react";

const NavigateRightButton = ({
  images,
  currentIndex = 0,
  setCurrentIndex,
}: {
  images: FileObject[];
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            aria-hidden="true"
            data-slot="icon"
            className="h-6 w-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            ></path>
          </svg>
        </button>
      )}
    </>
  );
};
export default NavigateRightButton;
