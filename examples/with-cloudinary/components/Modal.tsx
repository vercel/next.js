import { Dialog } from "@headlessui/react";
import { motion, MotionConfig } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/router";
import { useRef } from "react";
import useKeypress from "react-use-keypress";
import { ImageProps } from "../utils/imageType";
import SharedModal from "./SharedModal";

export default function Modal({
  images,
  onClose,
}: {
  images: ImageProps[];
  onClose?: () => void;
}) {
  let overlayRef = useRef();
  const router = useRouter();

  const { photoId } = router.query;
  let index = Number(photoId);

  const currentPhoto = images.find((img) => img.id === index);

  function handleClose() {
    router.push("/", undefined, { shallow: true });

    onClose();
  }

  function changePhotoId(newVal: number) {
    router.push(
      {
        query: { photoId: newVal },
      },
      `/p/${newVal}`,
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

  return (
    <Dialog
      static
      open={true}
      onClose={handleClose}
      initialFocus={overlayRef}
      className="fixed inset-0 z-10 flex items-center justify-center"
    >
      <MotionConfig
        transition={{
          duration: 0.7,
          ease: [0.32, 0.72, 0, 1],
        }}
      >
        <Dialog.Overlay
          ref={overlayRef}
          as={motion.div}
          key="backdrop"
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Image
            src={images[index].blurDataUrl}
            className="pointer-events-none fixed h-full w-full"
            alt="blurred background"
            fill
          />
        </Dialog.Overlay>
        <SharedModal
          index={index}
          images={images}
          changePhotoId={changePhotoId}
          currentPhoto={currentPhoto}
          closeModal={handleClose}
        />
      </MotionConfig>
    </Dialog>
  );
}
