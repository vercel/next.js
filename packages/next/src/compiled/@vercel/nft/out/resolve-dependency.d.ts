import { Job } from './node-file-trace';
export default function resolveDependency(specifier: string, parent: string, job: Job, cjsResolve?: boolean): Promise<string | string[]>;
export declare class NotFoundError extends Error {
    code: string;
    constructor(specifier: string, parent: string);
}
