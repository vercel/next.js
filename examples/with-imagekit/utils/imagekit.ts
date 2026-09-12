import ImageKit from "imagekit";
import { FilterType } from "./types";
import { FilterEnum } from "./enum";
import { FileObject } from "imagekit/dist/libs/interfaces";

const CONFIG_OPTIONS = {
  publicKey: process.env.NEXT_PUBLIC_PUBLIC_KEY as string,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY as string,
  urlEndpoint: process.env.NEXT_PUBLIC_URL_ENDPOINT as string,
};

const createSearchQuery = (filterState: FilterType) => {
  switch (filterState) {
    case FilterEnum.PHOTOS:
      return '"private" = false AND (type="file") AND (format IN ["jpg","webp","png","gif","svg","avif","ico"])';
    case FilterEnum.VIDEOS:
      return '"private" = false AND (type="file") AND (format IN ["mp4","m4v","webm","mov"])';
    default:
      return '"private" = false AND (type="file") AND (format IN ["mp4","m4v","webm","mov","jpg","webp","png","gif","svg","avif","ico"])';
  }
};

export const listFiles = async (
  limit = 10,
  skip = 0,
  filterState: FilterType,
  sort?: string | string[],
  sortDirection?: string | string[],
) => {
  const imagekit = new ImageKit(CONFIG_OPTIONS);

  const response = await imagekit.listFiles({
    limit,
    skip,
    fileType: "all",
    searchQuery: createSearchQuery(filterState),
    path: process.env.IMAGEKIT_FOLDER,
    sort: sortDirection && sort ? `${sortDirection}_${sort}` : "DESC_CREATED",
  });
  return response;
};

export function getClosestSubarray(
  arr: FileObject[],
  targetIndex: number,
  numElements = 5,
) {
  const half = Math.floor(numElements / 2);

  let start = targetIndex - half;
  let end = targetIndex + half + 1;

  if (start < 0) {
    start = 0;
    end = numElements;
  } else if (end > arr.length) {
    end = arr.length;
    start = arr.length - numElements;
  }

  start = Math.max(start, 0);

  return arr
    .slice(start, end)
    .map((data, index) => ({ ...data, index: start + index }));
}
