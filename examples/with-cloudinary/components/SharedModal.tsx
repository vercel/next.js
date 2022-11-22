/* eslint-disable no-unused-vars */
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import Image from "next/image";
import { useSwipeable } from "react-swipeable";
import downloadPhoto from "../utils/downloadPhoto";
import { ImageProps } from "../utils/imageType";

export default function SharedModal({
  index,
  images,
  changePhotoId,
  currentPhoto,
  closeModal,
}: {
  index: number;
  images: ImageProps[];
  changePhotoId: (newVal: number) => void;
  currentPhoto: ImageProps;
  closeModal: () => void;
}) {
  const handlers = useSwipeable({
    onSwipedLeft: () => changePhotoId(index + 1),
    onSwipedRight: () => changePhotoId(index - 1),
    trackMouse: true,
  });
  return (
    <>
      <div
        className="relative z-50 flex aspect-[3/2] w-full max-w-7xl items-center wide:h-full wide:w-auto xl:taller-than-854:h-auto"
        {...handlers}
      >
        <div className="absolute inset-0 z-40 mx-auto flex max-w-7xl items-center justify-center">
          {/* Buttons */}
          <div className="relative aspect-[3/2] max-h-full w-full">
            {index > 0 && (
              <button
                className="absolute left-3 top-[calc(50%-16px)] rounded-full bg-black/50 p-3 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
                style={{ transform: "translate3d(0, 0, 0)" }}
                onClick={() => changePhotoId(index - 1)}
              >
                <ChevronLeftIcon className="h-6 w-6" />
              </button>
            )}
            {index + 1 < images.length && (
              <button
                className="absolute right-3 top-[calc(50%-16px)] rounded-full bg-black/50 p-3 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
                style={{ transform: "translate3d(0, 0, 0)" }}
                onClick={() => changePhotoId(index + 1)}
              >
                <ChevronRightIcon className="h-6 w-6" />
              </button>
            )}
            <div className="absolute top-0 right-0 flex items-center gap-2 p-3 text-white">
              <a
                href={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${currentPhoto.public_id}.${currentPhoto.format}`}
                className="rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
                target="_blank"
                title="Open fullsize version"
                rel="noreferrer"
              >
                <ArrowTopRightOnSquareIcon className="h-5 w-5" />
              </a>
              <button
                onClick={() =>
                  downloadPhoto(
                    `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${currentPhoto.public_id}.${currentPhoto.format}`,
                    `${index}.jpg`
                  )
                }
                className="rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
                title="Download fullsize version"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="absolute top-0 left-0 flex items-center gap-2 p-3 text-white">
              <button
                onClick={() => closeModal()}
                className="rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          {/* Bottom Nav bar */}
          <div className="fixed inset-x-0 bottom-0 z-40 overflow-hidden bg-gradient-to-b from-black/0 to-black/60">
            <motion.div
              initial={false}
              animate={{ x: `${-index * 50}%` }}
              className="mx-auto mt-6 mb-6 flex aspect-[3/2] h-14"
            >
              {images.map(({ public_id, format, id }) => (
                <motion.button
                  initial={false}
                  animate={{
                    width: id === index ? "100%" : "50%",
                    scale: id === index ? 1.25 : 1,
                  }}
                  onClick={() => changePhotoId(id)}
                  key={id}
                  className={`${
                    id === index
                      ? "z-20 rounded-md shadow-xl shadow-black/50"
                      : "z-10 "
                  } ${id === 0 ? "rounded-l-md" : ""} ${
                    id === images.length - 1 ? "rounded-r-md" : ""
                  } relative inline-block w-full shrink-0 transform-gpu overflow-hidden`}
                >
                  <Image
                    alt="small photos on the bottom"
                    width={240}
                    height={160}
                    className={`${
                      id === index
                        ? "brightness-110 hover:brightness-110"
                        : "brightness-50 contrast-125 hover:brightness-75"
                    } h-full transform object-cover transition`}
                    src={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/c_scale,w_240/${public_id}.${format}`}
                  />
                </motion.button>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Main image */}
        <div className="transform-gpu overflow-hidden rounded shadow-2xl shadow-black">
          <motion.div
            animate={{ x: `${-index * 100}%` }}
            className="flex"
            initial={false}
          >
            {images.map(({ public_id, format, id, width, height }) => (
              <Image
                key={id}
                alt="Image from Next.js Conf"
                src={`https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/c_scale,w_1280/${public_id}.${format}`}
                width={Number(width)}
                height={Number(height)}
                className="pointer-events-none shrink-0"
                priority={id === index}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </>
  );
}
