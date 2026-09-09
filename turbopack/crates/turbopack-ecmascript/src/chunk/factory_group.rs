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
/// Separates the strict array returned by the IIFE from the non-strict array.
const STRICT_FACTORY_GROUP_SEPARATOR: &str = "\n]})(),[";
/// Closes the non-strict factory array.
const STRICT_FACTORY_GROUP_SUFFIX: &str = "\n]";

/// Grouping the strict factories only pays off when the directives it removes outweigh the wrapper
/// it adds, which is the case from three strict factories onwards.
pub fn should_group_strict_factories(strict_factory_count: usize) -> bool {
    strict_factory_count.saturating_mul(STRICT_MODE_DIRECTIVE.len())
        > STRICT_FACTORY_GROUP_PREFIX.len()
            + STRICT_FACTORY_GROUP_SEPARATOR.len()
            + STRICT_FACTORY_GROUP_SUFFIX.len()
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
/// When `group_strict_factories` is set, the strict factories are written into an array returned by
/// a strict-mode IIFE and the non-strict factories into a second array, so that the strict-mode
/// directive is emitted once per chunk instead of once per factory. Otherwise all factories are
/// written into a single flat sequence.
pub fn write_module_factories(
    code: &mut CodeBuilder,
    chunk_items: &[ReadRef<CodeModuleIdsAndPaths>],
    group_strict_factories: bool,
) -> Result<()> {
    if group_strict_factories {
        *code += STRICT_FACTORY_GROUP_PREFIX;
        write_factories(code, chunk_items, ModuleFactoryMode::is_strict)?;
        *code += STRICT_FACTORY_GROUP_SEPARATOR;
        write_factories(code, chunk_items, |mode| !mode.is_strict())?;
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
