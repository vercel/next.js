import type { AgentUpgradePolicy, UpgradeConfig } from './future-defaults';
import { type FutureDefaultEntry } from './future-defaults';
export type UpgradePreparation = {
    status: 'unaffected' | 'blocked' | 'unknown';
    reason: string;
} | {
    status: 'ready';
    installedVersion: string;
    targetVersion: string;
    references: string[];
    futureDefaults: FutureDefaultEntry[];
};
export type UpgradeReminder = {
    policy: AgentUpgradePolicy;
    installedVersion: string;
} & ({
    kind: 'security';
    reference: string | null;
    targetVersion: string;
} | {
    kind: 'latest';
    latestVersion: string | null;
    names: string[];
} | {
    kind: 'experimental-future';
    targetVersion: string;
    names: string[];
});
export type UpgradeAssessment = {
    affected: boolean | null;
    reference: string | null;
    upgrade: UpgradePreparation;
};
export declare function getUpgradeAssessment(installedVersion: string, policy: 'security' | 'latest' | 'experimental-future', onlyIfAffected?: boolean): Promise<UpgradeAssessment>;
export declare function getPrereleaseChannel(version: string): string | null;
export declare function getLatestUpgradeVersion(version: string, targetVersion: string): string | null;
export declare function getUpgradeReminder(directory: string, config: UpgradeConfig & {
    experimental: {
        agentUpgrade: AgentUpgradePolicy | false;
    };
}, policy: AgentUpgradePolicy, installedVersion: string, assessment: UpgradeAssessment, stopBefore: AgentUpgradePolicy | null, forceVersionReminder: boolean): UpgradeReminder | null;
