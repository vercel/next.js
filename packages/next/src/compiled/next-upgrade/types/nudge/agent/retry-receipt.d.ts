import type { AgentUpgradePolicy } from '../../shared/future-defaults';
export declare function claimNudgeRetry({ directory, distDir, command, }: {
    directory: string;
    distDir: string;
    command: 'dev' | 'build';
}, version: string, kind: AgentUpgradePolicy, allowedRetries: ReadonlySet<string>): Promise<{
    identity: string;
    allowed: boolean;
}>;
