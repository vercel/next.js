/// <reference types="node" />
import type { Stats } from "fs";
export declare class CachedFileSystem {
    private fileCache;
    private statCache;
    private symlinkCache;
    private fileIOQueue;
    constructor({ cache, fileIOConcurrency, }: {
        cache?: {
            fileCache?: Map<string, Promise<string | null>>;
            statCache?: Map<string, Promise<Stats | null>>;
            symlinkCache?: Map<string, Promise<string | null>>;
        };
        fileIOConcurrency: number;
    });
    readlink(path: string): Promise<string | null>;
    readFile(path: string): Promise<string | null>;
    stat(path: string): Promise<Stats | null>;
    private _internalReadlink;
    private _internalReadFile;
    private _internalStat;
    private executeFileIO;
}
