"use client";
import React, { useState, useEffect } from "react";
import Masonry from "react-responsive-masonry";
import { FilterEnum } from "@/utils/enum";
import { IKImage, IKVideo } from "imagekitio-next";
import Link from "next/link";
import { FileObject } from "imagekit/dist/libs/interfaces";
import { SortDirectionType, SortType } from "@/utils/types";
import SortDropdown from "./SortDropdown";

interface ContentProps {
  allFiles: FileObject[];
  images: FileObject[];
  videos: FileObject[];
  sort?: SortType;
  sortDirection?: SortDirectionType;
}

export default function Content({
  allFiles,
  images,
  videos,
  sort,
  sortDirection,
}: ContentProps) {
  const [filterState, setFilterState] = useState(FilterEnum.ALL);
  const [files, setFiles] = useState<FileObject[]>(allFiles);

  useEffect(() => {
    switch (filterState) {
      case FilterEnum.ALL:
        setFiles(allFiles);
        break;
      case FilterEnum.PHOTOS:
        setFiles(images);
        break;
      default:
        setFiles(videos);
        break;
    }
  }, [filterState, allFiles, images, videos]);

  return (
    <>
      <div className="flex justify-between">
        <div className="flex gap-4 items-center">
          <button
            className="border-none bg-black cursor-pointer text-base"
            onClick={() => setFilterState(FilterEnum.ALL)}
            style={
              filterState === FilterEnum.ALL
                ? { color: "#fff" }
                : { color: "#a0a0a0" }
            }
          >
            All
          </button>
          <hr className="h-4 m-0 border-0 border-l border-l-[#e1dfe0]" />
          <button
            className="border-none bg-black cursor-pointer text-base"
            onClick={() => setFilterState(FilterEnum.PHOTOS)}
            style={
              filterState === FilterEnum.PHOTOS
                ? { color: "#fff" }
                : { color: "#a0a0a0" }
            }
          >
            Photos
          </button>
          <hr className="h-4 m-0 border-0 border-l border-l-[#e1dfe0]" />
          <button
            className="border-none bg-black cursor-pointer text-base"
            onClick={() => setFilterState(FilterEnum.VIDEOS)}
            style={
              filterState === FilterEnum.VIDEOS
                ? { color: "#fff" }
                : { color: "#a0a0a0" }
            }
          >
            Videos
          </button>
        </div>
        <div>
          <SortDropdown sortParam={sort} sortDirectionParam={sortDirection} />
        </div>
      </div>

      <Masonry columnsCount={4} gutter="10px">
        {files.map((data) => (
          <Link
            key={data.fileId}
            href={`/asset/${data.fileId}`}
            shallow
            className="masonry-item rounded-lg overflow-hidden"
          >
            {data.fileType === "image" ? (
              <IKImage
                urlEndpoint={process.env.NEXT_PUBLIC_URL_ENDPOINT || ""}
                src={data.url}
                width={300}
                height={(300 * data.height) / data.width}
                alt="image"
              />
            ) : (
              <IKVideo
                urlEndpoint={process.env.NEXT_PUBLIC_URL_ENDPOINT || ""}
                src={data.url}
                width={300}
              />
            )}
          </Link>
        ))}
      </Masonry>
    </>
  );
}
