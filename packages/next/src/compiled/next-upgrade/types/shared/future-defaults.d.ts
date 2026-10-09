export type AgentUpgradePolicy = 'security' | 'latest' | 'experimental-future';
export type UpgradeConfig = {
    cacheComponents: boolean | undefined;
};
export type UpgradeDocument = `docs/${string}.md` | `skills/${string}/SKILL.md`;
export declare const futureDefaults: readonly [{
    readonly name: "Cache Components";
    readonly availableSince: "16.3.0";
    readonly isAdopted: (config: UpgradeConfig) => boolean;
    readonly adoptionDoc: readonly ["docs/01-app/02-guides/migrating-to-cache-components.md", "skills/next-cache-components-adoption/SKILL.md"];
    readonly optimizationDoc: readonly ["skills/next-cache-components-optimizer/SKILL.md"];
    readonly isApplicable: (directory: string) => boolean;
}];
export type FutureDefaultEntry = (typeof futureDefaults)[number];
export declare function getPendingFutureDefaults(directory: string, config: UpgradeConfig, version: string): {
    readonly name: "Cache Components";
    readonly availableSince: "16.3.0";
    readonly isAdopted: (config: UpgradeConfig) => boolean;
    readonly adoptionDoc: readonly ["docs/01-app/02-guides/migrating-to-cache-components.md", "skills/next-cache-components-adoption/SKILL.md"];
    readonly optimizationDoc: readonly ["skills/next-cache-components-optimizer/SKILL.md"];
    readonly isApplicable: (directory: string) => boolean;
}[];
