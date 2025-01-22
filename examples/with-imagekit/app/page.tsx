import { listFiles } from "@/utils/imagekit";
import { FilterEnum } from "@/utils/enum";
import { SortDirectionType, SortType } from "@/utils/types";
import Content from "../components/Content";
import Header from "@/components/Header";
import { FileObject } from "imagekit/dist/libs/interfaces";

interface GalleryPageProps {
  searchParams?: {
    sort?: SortType;
    sortDirection?: SortDirectionType;
  };
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const { sort, sortDirection } = await searchParams || {};

  const allFiles = (await listFiles(
    100,
    0,
    FilterEnum.ALL,
    sort,
    sortDirection,
  )) as FileObject[];
  const images = allFiles.filter((data: FileObject) => data.fileType === "image");
  const videos = allFiles.filter((data: FileObject) => data.fileType !== "image");

  return (
    <div className="flex flex-col items-center px-20 pb-20 pt-0">
      <div className="mt-10 flex flex-col gap-10 max-w-[1230px] w-full">
        <Header />
        <Content
          allFiles={allFiles}
          images={images}
          videos={videos}
          sort={sort}
          sortDirection={sortDirection}
        />
      </div>
    </div>
  );
}
