export const FilterEnum = {
  ALL: "all",
  PHOTOS: "photos",
  VIDEOS: "videos",
};

export enum SortEnum {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  NAME = 'NAME',
  HEIGHT = 'HEIGHT',
  WIDTH = 'WIDTH',
  SIZE = 'SIZE',
  RELEVANCE = 'RELEVANCE',
}

export enum SortLabelEnum {
  CREATED = 'Creation Date',
  UPDATED = 'Last Updated Date',
  NAME = 'Name',
  HEIGHT = 'Image Height',
  WIDTH = 'Image Width',
  SIZE = 'File Size',
  RELEVANCE = 'Relevance',
}

export enum SortDirectionEnum {
  DESC = 'DESC',
  ASC = 'ASC',
}