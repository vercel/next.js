use std::io::Write;

use anyhow::Result;
use turbo_tasks::ReadRef;
use turbopack_core::code_builder::CodeBuilder;

use crate::{
    chunk::{CodeModuleIdsAndPaths, ModuleFactoryMode},
    utils::StringifyJs,
};

/// Strict-mode directive emitted by a module factory. It is omitted from factories that a chunk
/// creates inside its strict factory group.
pub const STRICT_MODE_DIRECTIVE: &str = "\"use strict\";\n\n";
/// Start of the strict array's IIFE.
const STRICT_FACTORY_GROUP_PREFIX: &str = "\n(function(){\"use strict\";return[";
/// Closes the strict array and IIFE while leaving the outer factory sequence open.
const STRICT_FACTORY_GROUP_SUFFIX: &str = "\n]})(),";

/// Grouping the strict factories only pays off when the directives it removes outweigh the wrapper
/// it adds, which is the case from three strict factories onwards.
pub fn should_group_strict_factories(strict_factory_count: usize) -> bool {
    strict_factory_count.saturating_mul(STRICT_MODE_DIRECTIVE.len())
        > STRICT_FACTORY_GROUP_PREFIX.len() + STRICT_FACTORY_GROUP_SUFFIX.len()
}

/// Sorts chunk items by module path so that similar modules stay together and the chunk gzips
/// better.
pub fn sort_chunk_items_by_path(chunk_items: &mut [ReadRef<CodeModuleIdsAndPaths>]) {
    chunk_items.sort_by(|a, b| {
        a.first()
            .map(|(id, _, path, _)| (path, id))
            .cmp(&b.first().map(|(id, _, path, _)| (path, id)))
    });
}

/// Writes the `id, factory,` pairs of a chunk into `code`.
///
/// When `group_strict_factories` is set, non-strict factories stay in the flat sequence and the
/// strict factories are appended as an array returned by a strict-mode IIFE. This emits the
/// strict-mode directive once per chunk instead of once per factory without adding an empty array
/// to all-strict chunks. Otherwise all factories are written into one flat sequence.
pub fn write_module_factories(
    code: &mut CodeBuilder,
    chunk_items: &[ReadRef<CodeModuleIdsAndPaths>],
    group_strict_factories: bool,
) -> Result<()> {
    if group_strict_factories {
        write_factories(code, chunk_items, |mode| !mode.is_strict())?;
        *code += STRICT_FACTORY_GROUP_PREFIX;
        write_factories(code, chunk_items, ModuleFactoryMode::is_strict)?;
        *code += STRICT_FACTORY_GROUP_SUFFIX;
    } else {
        write_factories(code, chunk_items, |_| true)?;
    }
    Ok(())
}

fn write_factories(
    code: &mut CodeBuilder,
    chunk_items: &[ReadRef<CodeModuleIdsAndPaths>],
    include: impl Fn(ModuleFactoryMode) -> bool,
) -> Result<()> {
    for item in chunk_items {
        for (id, item_code, _, mode) in &***item {
            if include(*mode) {
                write!(code, "\n{}, ", StringifyJs(id))?;
                code.push_code(item_code);
                write!(code, ",")?;
            }
        }
    }
    Ok(())
}
