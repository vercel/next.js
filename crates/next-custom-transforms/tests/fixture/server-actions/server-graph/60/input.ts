'use cache'

// Exported TypeScript nodes should be ignored when validating that all module
// exports are async functions.
export type T = {}
export interface I {}
export enum E {}
export default interface D {}

export async function Page() {}
