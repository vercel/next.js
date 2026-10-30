use std::io::Write;

use anyhow::Result;
use turbopack_core::code_builder::CodeBuilder;

use crate::{chunk::CodeModuleIdAndPath, utils::StringifyJs};

/// Whether the chunk file should start with a `"use strict"` directive, which makes every module
/// factory in it strict.
///
/// That is the case when all factories are strict. It costs no more than the directive of a
/// single strict factory, and the minifier drops the then redundant directives of the factories.
///
/// Chunks that mix strict and non-strict factories don't get one; each strict factory keeps its
/// own directive instead. This preserves the original factory order and avoids depending on a
/// strict IIFE expression surviving minification.
pub fn chunk_has_strict_directive(chunk_items: &[CodeModuleIdAndPath]) -> bool {
    !chunk_items.is_empty() && chunk_items.iter().all(|item| item.strict)
}

/// Writes the module factories as `id, factory,` array elements, in order.
pub fn write_module_factories(
    code: &mut CodeBuilder,
    chunk_items: &[CodeModuleIdAndPath],
) -> Result<()> {
    for item in chunk_items {
        write!(code, "\n{}, ", StringifyJs(&item.id))?;
        code.push_code(&item.code);
        write!(code, ",")?;
    }
    Ok(())
}
