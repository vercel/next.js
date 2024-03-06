export declare class Sema {
    private nrTokens;
    private free;
    private waiting;
    private releaseEmitter;
    private noTokens;
    private pauseFn?;
    private resumeFn?;
    private paused;
    constructor(nr: number, { initFn, pauseFn, resumeFn, capacity }?: {
        initFn?: () => any;
        pauseFn?: () => void;
        resumeFn?: () => void;
        capacity?: number;
    });
    acquire(): Promise<any>;
    release(token?: any): void;
    drain(): Promise<any[]>;
    nrWaiting(): number;
}
export declare function RateLimit(rps: number, { timeUnit, uniformDistribution }?: {
    timeUnit?: number;
    uniformDistribution?: boolean;
}): () => Promise<void>;
