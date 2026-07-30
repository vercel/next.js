//! Prints the TypeScript definitions for the HMR update-instruction wire
//! protocol to stdout, generated from the Rust source of truth (the
//! `chunk_list` instruction structs) via `ts-rs`.
//!
//! This keeps the generator itself free of any consumer-specific paths: it only
//! emits the type declarations. The Next.js build tooling
//! (`scripts/generate-hmr-types.ts`) captures this output, adds a
//! "do not edit" header, formats it, and vendors it into `packages/next`.
//!
//! Run with:
//!
//! ```sh
//! cargo run -p turbopack-ecmascript --example export_hmr_types
//! ```

use ts_rs::{Config, TS};
use turbopack_ecmascript::chunk_list::{
    merged_update::{
        EcmascriptMergedChunkAdded, EcmascriptMergedChunkDeleted, EcmascriptMergedChunkPartial,
        EcmascriptMergedChunkUpdate, EcmascriptMergedUpdate, EcmascriptModuleEntry,
    },
    update::{ChunkListUpdate, ChunkUpdate, HmrUpdateInstruction},
};

fn main() {
    let cfg = Config::default();
    // Emitted in dependency order (leaves first) so the resulting file needs no
    // forward declarations.
    let decls = [
        EcmascriptModuleEntry::decl(&cfg),
        EcmascriptMergedChunkAdded::decl(&cfg),
        EcmascriptMergedChunkDeleted::decl(&cfg),
        EcmascriptMergedChunkPartial::decl(&cfg),
        EcmascriptMergedChunkUpdate::decl(&cfg),
        EcmascriptMergedUpdate::decl(&cfg),
        ChunkUpdate::decl(&cfg),
        ChunkListUpdate::decl(&cfg),
        HmrUpdateInstruction::decl(&cfg),
    ];
    for decl in decls {
        println!("export {decl}");
    }
}
