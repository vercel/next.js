export type UpgradeAction = 'update' | 'skip' | 'dismiss' | 'interrupt';
export declare function promptUpgrade({ message, signal, canUpdate, onShown, }: {
    message: string;
    signal: AbortSignal;
    canUpdate: boolean;
    onShown: (() => void) | null;
}): Promise<UpgradeAction>;
