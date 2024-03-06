/// <reference types="node" />
import { Job } from './node-file-trace';
export interface Stats {
    isFile(): boolean;
    isDirectory(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isSymbolicLink(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
    dev: number;
    ino: number;
    mode: number;
    nlink: number;
    uid: number;
    gid: number;
    rdev: number;
    size: number;
    blksize: number;
    blocks: number;
    atimeMs: number;
    mtimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
    atime: Date;
    mtime: Date;
    ctime: Date;
    birthtime: Date;
}
export interface NodeFileTraceOptions {
    base?: string;
    processCwd?: string;
    exports?: string[];
    conditions?: string[];
    exportsOnly?: boolean;
    ignore?: string | string[] | ((path: string) => boolean);
    analysis?: boolean | {
        emitGlobs?: boolean;
        computeFileReferences?: boolean;
        evaluatePureExpressions?: boolean;
    };
    cache?: any;
    paths?: Record<string, string>;
    ts?: boolean;
    log?: boolean;
    mixedModules?: boolean;
    readFile?: (path: string) => Promise<Buffer | string | null>;
    stat?: (path: string) => Promise<Stats | null>;
    readlink?: (path: string) => Promise<string | null>;
    resolve?: (id: string, parent: string, job: Job, cjsResolve: boolean) => Promise<string | string[]>;
    fileIOConcurrency?: number;
}
export type NodeFileTraceReasonType = 'initial' | 'resolve' | 'dependency' | 'asset' | 'sharedlib';
export interface NodeFileTraceReasons extends Map<string, {
    type: NodeFileTraceReasonType[];
    ignored: boolean;
    parents: Set<string>;
}> {
}
export interface NodeFileTraceResult {
    fileList: Set<string>;
    esmFileList: Set<string>;
    reasons: NodeFileTraceReasons;
    warnings: Set<Error>;
}
