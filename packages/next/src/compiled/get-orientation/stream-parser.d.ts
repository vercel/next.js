/// <reference types="node" />
import * as Stream from "stream";
export interface IStreamParserWritable {
    new (...args: any[]): IStreamParserWritableBase;
}
export interface IStreamParserWritableBase {
    _bytes(n: number, cb: (buf: Buffer) => void): void;
    _skipBytes(n: number, cb: () => void): void;
}
export declare const StreamParserWritable: typeof Stream.Writable & IStreamParserWritable;
