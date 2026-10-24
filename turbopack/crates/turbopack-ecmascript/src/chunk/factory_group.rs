use std::io::Write;

use anyhow::Result;
use turbopack_core::code_builder::CodeBuilder;

use crate::{chunk::CodeModuleIdAndPath, utils::StringifyJs};

const ALL_STRICT_ARROW_PREFIX: &str = "(()=>{\"use strict\";";
const ALL_STRICT_FUNCTION_PREFIX: &str = "(function(){\"use strict\";";
const ALL_STRICT_SUFFIX: &str = "})()";

/// Minimum number of strict factories that makes hoisting the directive worth its wrapper.
/// Derived from the minified wrapper sizes and pinned by `strict_thresholds_match_wrapper_sizes`.
/// The arrow and function wrappers land on different minimums, which is why arrow support selects
/// between two constants here.
const ALL_STRICT_ARROW_THRESHOLD: usize = 2;
const ALL_STRICT_FUNCTION_THRESHOLD: usize = 3;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StrictFactoryMode {
    /// Every factory is written as is, each strict one carrying its own `"use strict"` directive.
    Flat,
    /// Every factory is strict, and the whole chunk is wrapped in a strict IIFE statement.
    AllStrict,
}

/// Selects the smallest expected minified representation for this chunk's mix of module factories.
///
/// Chunks that mix strict and non-strict factories are always written flat. Grouping the strict
/// factories into a strict IIFE *expression* (`[(()=>{"use strict";return[…]})(),…]`) is not safe:
/// the minifier drops the directive and inlines the IIFE, which leaves the strict factories in a
/// non-strict context.
pub fn strict_factory_mode(
    chunk_items: &[CodeModuleIdAndPath],
    supports_arrow_functions: bool,
) -> StrictFactoryMode {
    if chunk_items.iter().any(|item| !item.strict) {
        return StrictFactoryMode::Flat;
    }
    let threshold = if supports_arrow_functions {
        ALL_STRICT_ARROW_THRESHOLD
    } else {
        ALL_STRICT_FUNCTION_THRESHOLD
    };
    if chunk_items.len() >= threshold {
        StrictFactoryMode::AllStrict
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

const fn all_strict_prefix(supports_arrow_functions: bool) -> &'static str {
    if supports_arrow_functions {
        ALL_STRICT_ARROW_PREFIX
    } else {
        ALL_STRICT_FUNCTION_PREFIX
    }
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
            ALL_STRICT_ARROW_THRESHOLD,
            &format!("{ALL_STRICT_ARROW_PREFIX}{ALL_STRICT_SUFFIX}"),
        );
        assert_threshold(
            ALL_STRICT_FUNCTION_THRESHOLD,
            &format!("{ALL_STRICT_FUNCTION_PREFIX}{ALL_STRICT_SUFFIX}"),
        );
    }
}
