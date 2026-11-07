import { FileObject } from "imagekit/dist/libs/interfaces";
import { FilterEnum, SortDirectionEnum, SortEnum } from "./enum";

export type FilterType = (typeof FilterEnum)[keyof typeof FilterEnum];

export interface UpdatedFileObject extends FileObject {
  index: number;
}

export type SortType = (typeof SortEnum)[keyof typeof SortEnum];

export type SortDirectionType =
  (typeof SortDirectionEnum)[keyof typeof SortDirectionEnum];

export interface SortIconInterface {
  direction: SortDirectionType;
}
