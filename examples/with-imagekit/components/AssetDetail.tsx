"use client";
import { FileObject } from "imagekit/dist/libs/interfaces";
import Head from "next/head";
import { useRef } from "react";
import Carousel from "@/app/Carousel";

interface AssetDetailProps {
  images: FileObject[];
  assetId: string;
}

export default function AssetDetail({ images, assetId }: AssetDetailProps) {
  let currentImageIndex = images.findIndex((data) => data.fileId === assetId);

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
            assetId={assetId}
          />
        </div>
      </main>
    </>
  );
}
