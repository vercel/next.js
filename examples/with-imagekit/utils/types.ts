import { FileObject } from "imagekit/dist/libs/interfaces";
import { FilterEnum } from "./enum";

export type FilterType = (typeof FilterEnum)[keyof typeof FilterEnum];

export interface UpdatedFileObject extends FileObject {
    index: number;
  }