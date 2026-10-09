export declare const prefixes: {
    readonly wait: string;
    readonly error: string;
    readonly warn: string;
    readonly ready: "▲";
    readonly info: string;
    readonly event: string;
    readonly trace: string;
};
export declare function bootstrap(message: string): void;
export declare function wait(...message: any[]): void;
export declare function error(...message: any[]): void;
export declare function warn(...message: any[]): void;
export declare function ready(...message: any[]): void;
export declare function info(...message: any[]): void;
export declare function event(...message: any[]): void;
export declare function trace(...message: any[]): void;
