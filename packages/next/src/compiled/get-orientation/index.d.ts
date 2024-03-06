/// <reference types="node" />
import { Readable as ReadableStream } from "stream";
import { Orientation } from "./base";
import { StreamParserWritable } from "./stream-parser";
export { Orientation };
export declare class EXIFOrientationParser extends StreamParserWritable {
    constructor();
    private onSignature;
    private onJPEGMarker;
    private onTIFFHeader;
}
export declare function getOrientation(image: Buffer | ReadableStream): Promise<Orientation>;
