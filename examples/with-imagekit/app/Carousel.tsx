"use client";
import { FileObject } from "imagekit/dist/libs/interfaces";
import { IKImage, IKVideo } from "imagekitio-next";
import { RefObject, useEffect, useState } from "react";
import Preview from "../components/Preview";
import { getClosestSubarray } from "@/utils/imagekit";
import CancelButton from "../components/CancelButton";
import NavigateRightButton from "../components/NavigateRightButton";
import NavigateLeftButton from "../components/NavigateLeftButton";
import { useRouter } from "next/navigation";

const Carousel = ({
  images,
  currentImageIndex,
  imageWrapper,
  assetId,
}: {
  images: FileObject[];
  currentImageIndex: number;
  imageWrapper: RefObject<HTMLDivElement | null>;
  assetId: string;
}) => {
  const router = useRouter();
  const [imageWrapperDimension, setImageWrapperDimension] = useState({
    height: 0,
    width: 0,
  });
  const [currentIndex, setCurrentIndex] = useState<number>(currentImageIndex);

  useEffect(() => {
    if (imageWrapper.current) {
      setImageWrapperDimension({
        height: imageWrapper.current.clientHeight,
        width: imageWrapper.current.clientWidth,
      });
    }
  }, [currentIndex, images, imageWrapper]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && currentIndex !== 0) {
        setCurrentIndex((prev) => prev - 1);
      } else if (
        event.key === "ArrowRight" &&
        currentIndex + 1 < images.length
      ) {
        setCurrentIndex((prev) => prev + 1);
      }
      if (event.key === "Escape") {
        router.push("/");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentIndex, setCurrentIndex]);

  return (
    <>
      <NavigateLeftButton
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
      />
      {images[currentIndex].type === "file" &&
      images[currentIndex]?.fileType === "image" &&
      imageWrapperDimension.width &&
      imageWrapperDimension.height ? (
        <IKImage
          key={assetId}
          urlEndpoint={process.env.NEXT_PUBLIC_URL_ENDPOINT}
          src={images[currentIndex].url}
          width={imageWrapperDimension.width}
          height={imageWrapperDimension.height}
          alt="test"
        />
      ) : (
        images[currentIndex].type === "file" && (
          <IKVideo
            key={assetId}
            urlEndpoint={process.env.NEXT_PUBLIC_URL_ENDPOINT}
            src={images[currentIndex].url}
            style={{ height: imageWrapperDimension.height }}
            controls
          />
        )
      )}
      <Preview
        images={getClosestSubarray(images, currentIndex, 7)}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
      />
      <CancelButton />
      <NavigateRightButton
        images={images}
        currentIndex={currentIndex}
        setCurrentIndex={setCurrentIndex}
      />
    </>
  );
};

export default Carousel;
