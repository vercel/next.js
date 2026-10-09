import type { UpgradeReminder } from '../../shared/check-upgrade';
export declare function formatAgentNudge(reminder: UpgradeReminder, nudgeId: string): {
    summary: string;
    message: string;
    reference: string | null;
};
