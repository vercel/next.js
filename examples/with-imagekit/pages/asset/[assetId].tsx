import { FileObject } from "imagekit/dist/libs/interfaces";
import type { GetStaticProps } from "next";
import Head from "next/head";
import { FilterEnum } from "@/utils/enum";
import { listFiles } from "@/utils/imagekit";
import { useRef } from "react";
import Carousel from "@/components/Carousel";

export default function AssetDetail({
  images,
  currentImageIndex,
}: {
  images: FileObject[];
  currentImageIndex: number;
}) {
  const imageWrapper = useRef<HTMLDivElement>(null);
  return (
    <>
      <Head>
        <title>ImageKit asset preview</title>
      </Head>

      <main className="relative h-[calc(100vh)] mx-28 overflow-hidden">
        <div
          className="relative w-full h-full flex justify-center items-center bg-black flex-row"
          ref={imageWrapper}
        >
          <Carousel
            images={images}
            currentImageIndex={currentImageIndex}
            imageWrapper={imageWrapper}
          />
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps = async (context) => {
  const images = await listFiles(100, 0, FilterEnum.ALL);
  let currentImageIndex = images.findIndex(
    (data) => data.fileId === context?.params?.assetId,
  );
  return { props: { images, currentImageIndex } };
};

export async function getStaticPaths() {
  const images = await listFiles(100, 0, FilterEnum.ALL);
  const fullPaths = images.map((image) => {
    return { params: { assetId: image.fileId } };
  });

  return {
    paths: fullPaths,
    fallback: false,
  };
}
