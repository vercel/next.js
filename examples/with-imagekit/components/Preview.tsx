import { UpdatedFileObject } from "@/utils/types";
import { ListFileResponse } from "imagekit/dist/libs/interfaces";
import { IKImage } from "imagekitio-next";
import { Dispatch, SetStateAction } from "react";

const Preview = ({
  images,
  currentIndex = 0,
  setCurrentIndex,
}: {
  images: UpdatedFileObject[];
  currentIndex: number;
  setCurrentIndex: Dispatch<SetStateAction<number>>;
}) => {
  return (
    <div className="absolute flex bottom-10 gap-8">
      {images.map((data) => (
        <div
          key={data.fileId}
          className={`w-[100px] h-[100px] relative hover:opacity-100 cursor-pointer ${
            currentIndex === data.index
              ? "rounded border border-gray-300 opacity-100"
              : "inset-0 bg-black opacity-60"
          }`}
        >
          <IKImage
            urlEndpoint={process.env.NEXT_PUBLIC_URL_ENDPOINT}
            src={data.fileType === "image" ? data.url : data.thumbnail}
            alt="test"
            transformation={[{ width: "100", height: "100" }]}
            onClick={() => setCurrentIndex(data.index)}
          />
        </div>
      ))}
    </div>
  );
};

export default Preview;
