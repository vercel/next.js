import { FilterEnum } from "./enum";

export type FilterType = (typeof FilterEnum)[keyof typeof FilterEnum];
