import { MotionConfig } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/router";
import useKeypress from "react-use-keypress";
import { ImageProps } from "../utils/imageType";
import { useLastViewedPhoto } from "../utils/useLastViewedPhoto";
import SharedModal from "./SharedModal";

export default function Carousel({
  images,
  index,
  currentPhoto,
}: {
  images: ImageProps[];
  index: number;
  currentPhoto: ImageProps;
}) {
  const router = useRouter();
  const [, setLastViewedPhoto] = useLastViewedPhoto();

  function closeModal() {
    setLastViewedPhoto(currentPhoto.id);
    router.push("/");
  }

  function changePhotoId(newVal: number) {
    router.push(
      {
        pathname: `/p/${newVal}`,
      },
      undefined,
      { shallow: true }
    );
  }

  useKeypress("ArrowRight", () => {
    if (index + 1 < images.length) {
      changePhotoId(index + 1);
    }
  });

  useKeypress("ArrowLeft", () => {
    if (index > 0) {
      changePhotoId(index - 1);
    }
  });

  useKeypress("Escape", () => {
    closeModal();
  });

  return (
    <MotionConfig
      transition={{
        duration: 0.7,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      <div className="fixed inset-0 flex items-center justify-center">
        <button
          className="absolute inset-0 z-30 cursor-default bg-black backdrop-blur-2xl"
          onClick={closeModal}
        >
          <Image
            src={images[index].blurDataUrl}
            className="pointer-events-none h-full w-full"
            alt="blurred background"
            fill
          />
        </button>

        <SharedModal
          index={index}
          images={images}
          changePhotoId={changePhotoId}
          currentPhoto={currentPhoto}
          closeModal={closeModal}
        />
      </div>
    </MotionConfig>
  );
}
