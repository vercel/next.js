import ImageKit from "imagekit";
import { FilterType } from "./types";
import { FilterEnum } from "./enum";

const CONFIG_OPTIONS = {
  publicKey: process.env.NEXT_PUBLIC_PUBLIC_KEY as string,
  privateKey: process.env.PRIVATE_KEY as string,
  urlEndpoint: process.env.NEXT_PUBLIC_URL_ENDPOINT as string,
};

const imagekit = new ImageKit(CONFIG_OPTIONS);

export const listFiles = async (
  limit = 10,
  skip = 0,
  filterState: FilterType,
) => {
  const response = await imagekit.listFiles({
    limit,
    skip,
    fileType: "all",
    searchQuery:
      filterState === FilterEnum.PHOTOS
        ? '"private" = false AND (type="file") AND (format IN ["jpg","webp","png","gif","svg","avif","ico"])'
        : filterState === FilterEnum.VIDEOS
        ? '"private" = false AND (type="file") AND (format IN ["mp4","m4v","webm","mov"])'
        : '"private" = false AND (type="file") AND (format IN ["mp4","m4v","webm","mov","jpg","webp","png","gif","svg","avif","ico"])',
    path: process.env.IMAGEKIT_FOLDER,
  });
  return response;
};
