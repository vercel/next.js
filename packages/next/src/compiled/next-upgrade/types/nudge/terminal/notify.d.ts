import type { UpgradeReminder } from '../../shared/check-upgrade';
import type { UpgradeAction } from './prompt';
export declare function canPromptForUpgrade(forceTerminal: boolean, isCI: boolean): boolean;
export declare function nudgeUpgradeForHuman(directory: string, reminder: UpgradeReminder, signal: AbortSignal, onShown: (() => void) | null): Promise<UpgradeAction>;
