import type { AgentUpgradePolicy } from '../../shared/future-defaults';
export declare function getUpgradePreferences(directory: string): Promise<{
    key: string;
    preferences: {
        get(key: string): unknown;
        set(key: string, value: string): void;
    };
}>;
export declare function getUpgradeDismissal(directory: string, version: string, policy: AgentUpgradePolicy): Promise<AgentUpgradePolicy | null>;
