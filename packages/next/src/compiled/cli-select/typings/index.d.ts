/// <reference types="node"/>

declare type Index = number|string

interface ValueRenderer<T> {
  (value: T, selected: boolean): string
}

interface ResolvedValue<T> {
  id: Index,
  value: T
}

interface Callback<T> {
  (valueId: Index, value: T): any
}

interface ValuesObject<T> {
  [s: string]: T;
}

interface ValuesArray<T> extends Array<T> {}

interface Options<T> {
  outputStream?: NodeJS.WriteStream,
  inputStream?: NodeJS.WriteStream,
  values: ValuesObject<T> | ValuesArray<T>,
  defaultValue?: Index,
  selected?: string,
  unselected?: string,
  indentation?: number,
  cleanup?: boolean,
  valueRenderer?: ValueRenderer<T>
}

type creatorPromise = <T> (options: Options<T>) => Promise<ResolvedValue<T>>;
type creatorCallback = <T> (options: Options<T>, callback: Callback<T>) => void;
type creator = creatorPromise & creatorCallback;

interface creatorStatic {
  default: creator
}

declare const cliSelect: creator & creatorStatic;

export = cliSelect;
