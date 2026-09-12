use std::io::Write;

use anyhow::Result;
use turbopack_core::code_builder::CodeBuilder;

use crate::{
    chunk::{CodeModuleIdAndPath, ModuleFactoryMode},
    utils::StringifyJs,
};

const MIXED_ARROW_PREFIX: &str = "\n(()=>{\"use strict\";return[";
const MIXED_FUNCTION_PREFIX: &str = "\n(function(){\"use strict\";return[";
const MIXED_SUFFIX: &str = "\n]})(),";
const ALL_STRICT_ARROW_PREFIX: &str = "(()=>{\"use strict\";";
const ALL_STRICT_FUNCTION_PREFIX: &str = "(function(){\"use strict\";";
const ALL_STRICT_SUFFIX: &str = "})()";

/// Minimum number of strict factories that makes hoisting the directive worth its wrapper.
/// Derived from the minified wrapper sizes and pinned by `strict_thresholds_match_wrapper_sizes`.
/// The mixed wrappers differ in length but land on the same minimum; the all-strict ones do not,
/// which is why arrow support still selects between two constants here.
const MIXED_STRICT_THRESHOLD: usize = 3;
const ALL_STRICT_ARROW_THRESHOLD: usize = 2;
const ALL_STRICT_FUNCTION_THRESHOLD: usize = 3;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StrictFactoryMode {
    Flat,
    Mixed,
    AllStrict,
}

/// Selects the smallest expected minified representation for this chunk's mix of module factories.
pub fn strict_factory_mode(
    chunk_items: &[CodeModuleIdAndPath],
    supports_arrow_functions: bool,
) -> StrictFactoryMode {
    let mut strict = 0;
    let mut non_strict = 0;
    for (_, _, _, mode) in chunk_items {
        if mode.is_strict() {
            strict += 1;
        } else {
            non_strict += 1;
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
    let threshold = match (mode, supports_arrow_functions) {
        (StrictFactoryMode::Mixed, _) => MIXED_STRICT_THRESHOLD,
        (StrictFactoryMode::AllStrict, true) => ALL_STRICT_ARROW_THRESHOLD,
        (StrictFactoryMode::AllStrict, false) => ALL_STRICT_FUNCTION_THRESHOLD,
        (StrictFactoryMode::Flat, _) => unreachable!(),
    };
    if strict >= threshold {
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

/// Writes flat factories, with a strict IIFE prepended to the non-strict factories in mixed chunks.
pub fn write_module_factories(
    code: &mut CodeBuilder,
    chunk_items: &[CodeModuleIdAndPath],
    mode: StrictFactoryMode,
    supports_arrow_functions: bool,
) -> Result<()> {
    if mode == StrictFactoryMode::Mixed {
        *code += mixed_prefix(supports_arrow_functions);
        write_factories(code, chunk_items, ModuleFactoryMode::is_strict)?;
        *code += MIXED_SUFFIX;
        write_factories(code, chunk_items, |mode| !mode.is_strict())?;
    } else {
        write_factories(code, chunk_items, |_| true)?;
    }
    Ok(())
}

fn write_factories(
    code: &mut CodeBuilder,
    chunk_items: &[CodeModuleIdAndPath],
    include: impl Fn(ModuleFactoryMode) -> bool,
) -> Result<()> {
    for (id, item_code, _, mode) in chunk_items {
        if include(*mode) {
            write!(code, "\n{}, ", StringifyJs(id))?;
            code.push_code(item_code);
            write!(code, ",")?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Minified length of the `"use strict";` directive that
    /// `EcmascriptChunkItemContent::module_factory` writes into every strict factory, and that
    /// the minimizer removes again inside a strict wrapper. The trailing newlines the factory
    /// writes do not survive minification, so they are not counted. Kept here because only these
    /// assertions need it.
    const STRICT_MODE_DIRECTIVE_LEN: usize = "\"use strict\";".len();

    fn minified_len(wrapper: &str) -> usize {
        // Formatting whitespace is only added at line boundaries. Trim each line rather than all
        // whitespace so the space inside the `"use strict"` string literal is preserved.
        wrapper.lines().map(str::trim).map(str::len).sum()
    }

    /// `threshold` must be the smallest factory count worth grouping: one below it the directives
    /// do not outweigh the wrapper, at the threshold they do.
    fn assert_threshold(threshold: usize, wrapper: &str) {
        let wrapper_len = minified_len(wrapper);
        assert!((threshold - 1) * STRICT_MODE_DIRECTIVE_LEN <= wrapper_len);
        assert!(threshold * STRICT_MODE_DIRECTIVE_LEN > wrapper_len);
    }

    #[test]
    fn strict_thresholds_match_wrapper_sizes() {
        assert_threshold(
            MIXED_STRICT_THRESHOLD,
            &format!("{MIXED_ARROW_PREFIX}{MIXED_SUFFIX}"),
        );
        assert_threshold(
            MIXED_STRICT_THRESHOLD,
            &format!("{MIXED_FUNCTION_PREFIX}{MIXED_SUFFIX}"),
        );
        assert_threshold(
            ALL_STRICT_ARROW_THRESHOLD,
            &format!("{ALL_STRICT_ARROW_PREFIX}{ALL_STRICT_SUFFIX}"),
        );
        assert_threshold(
            ALL_STRICT_FUNCTION_THRESHOLD,
            &format!("{ALL_STRICT_FUNCTION_PREFIX}{ALL_STRICT_SUFFIX}"),
        );
    }
}
