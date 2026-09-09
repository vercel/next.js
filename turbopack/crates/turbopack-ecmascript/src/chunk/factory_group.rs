use std::io::Write;

use anyhow::Result;
use turbo_tasks::ReadRef;
use turbopack_core::code_builder::CodeBuilder;

use crate::{
    chunk::{CodeModuleIdsAndPaths, ModuleFactoryMode},
    utils::StringifyJs,
};

const STRICT_MODE_DIRECTIVE: &str = "\"use strict\";\n\n";
const MIXED_ARROW_PREFIX: &str = "\n(()=>{\"use strict\";return[";
const MIXED_FUNCTION_PREFIX: &str = "\n(function(){\"use strict\";return[";
const MIXED_SUFFIX: &str = "\n]})(),";
const ALL_STRICT_ARROW_PREFIX: &str = "(()=>{\"use strict\";";
const ALL_STRICT_FUNCTION_PREFIX: &str = "(function(){\"use strict\";";
const ALL_STRICT_SUFFIX: &str = "})()";

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StrictFactoryMode {
    Flat,
    Mixed,
    AllStrict,
}

/// Selects the smallest expected minified representation. The minimizer removes factory directives
/// inside a strict wrapper, so hoisting only pays off when those bytes outweigh the wrapper.
pub fn strict_factory_mode(
    chunk_items: &[ReadRef<CodeModuleIdsAndPaths>],
    supports_arrow_functions: bool,
) -> StrictFactoryMode {
    let mut strict = 0;
    let mut non_strict = 0;
    for item in chunk_items {
        for (_, _, _, mode) in &***item {
            if mode.is_strict() {
                strict += 1;
            } else {
                non_strict += 1;
            }
        }
    }
    if strict == 0 {
        return StrictFactoryMode::Flat;
    }

    let mode = if non_strict == 0 {
        StrictFactoryMode::AllStrict
    } else {
        StrictFactoryMode::Mixed
    };
    let wrapper_len = match mode {
        StrictFactoryMode::Mixed => {
            mixed_prefix(supports_arrow_functions).len() + MIXED_SUFFIX.len()
        }
        StrictFactoryMode::AllStrict => {
            all_strict_prefix(supports_arrow_functions).len() + ALL_STRICT_SUFFIX.len()
        }
        StrictFactoryMode::Flat => unreachable!(),
    };
    if strict * STRICT_MODE_DIRECTIVE.len() > wrapper_len {
        mode
    } else {
        StrictFactoryMode::Flat
    }
}

/// Code written around the whole chunk in the all-strict case.
pub fn strict_chunk_wrapper(
    mode: StrictFactoryMode,
    supports_arrow_functions: bool,
) -> Option<(&'static str, &'static str)> {
    (mode == StrictFactoryMode::AllStrict).then(|| {
        (
            all_strict_prefix(supports_arrow_functions),
            ALL_STRICT_SUFFIX,
        )
    })
}

const fn mixed_prefix(supports_arrow_functions: bool) -> &'static str {
    if supports_arrow_functions {
        MIXED_ARROW_PREFIX
    } else {
        MIXED_FUNCTION_PREFIX
    }
}

const fn all_strict_prefix(supports_arrow_functions: bool) -> &'static str {
    if supports_arrow_functions {
        ALL_STRICT_ARROW_PREFIX
    } else {
        ALL_STRICT_FUNCTION_PREFIX
    }
}

pub fn sort_chunk_items_by_path(chunk_items: &mut [ReadRef<CodeModuleIdsAndPaths>]) {
    chunk_items.sort_by(|a, b| {
        a.first()
            .map(|(id, _, path, _)| (path, id))
            .cmp(&b.first().map(|(id, _, path, _)| (path, id)))
    });
}

/// Writes flat factories, with strict factories moved into a strict IIFE for mixed chunks.
pub fn write_module_factories(
    code: &mut CodeBuilder,
    chunk_items: &[ReadRef<CodeModuleIdsAndPaths>],
    mode: StrictFactoryMode,
    supports_arrow_functions: bool,
) -> Result<()> {
    if mode == StrictFactoryMode::Mixed {
        write_factories(code, chunk_items, |mode| !mode.is_strict())?;
        *code += mixed_prefix(supports_arrow_functions);
        write_factories(code, chunk_items, ModuleFactoryMode::is_strict)?;
        *code += MIXED_SUFFIX;
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
