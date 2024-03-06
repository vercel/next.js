import { Job } from './node-file-trace';
export interface AnalyzeResult {
    assets: Set<string>;
    deps: Set<string>;
    imports: Set<string>;
    isESM: boolean;
}
export default function analyze(id: string, code: string, job: Job): Promise<AnalyzeResult>;
