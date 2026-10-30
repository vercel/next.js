use std::io::Write;

use anyhow::Result;
use turbopack_core::code_builder::CodeBuilder;

use crate::{chunk::CodeModuleIdAndPath, utils::StringifyJs};

// The chunk scaffolding is written in minified form in every mode, so a chunk whose factories
// are minified individually needs no further minification pass.
const MIXED_ARROW_PREFIX: &str = "(()=>{\"use strict\";return[";
const MIXED_FUNCTION_PREFIX: &str = "(function(){\"use strict\";return[";
const MIXED_SUFFIX: &str = "]})()";
const ALL_STRICT_ARROW_PREFIX: &str = "(()=>{\"use strict\";";
const ALL_STRICT_FUNCTION_PREFIX: &str = "(function(){\"use strict\";";
const ALL_STRICT_SUFFIX: &str = "})()";

/// Minimum number of strict factories that makes hoisting the directive worth its wrapper.
/// Derived from the wrapper sizes and pinned by `strict_thresholds_match_wrapper_sizes`. The
/// mixed wrappers differ in length but land on the same minimum; the all-strict ones do not,
/// which is why arrow support still selects between two constants here.
const MIXED_STRICT_THRESHOLD: usize = 3;
const ALL_STRICT_ARROW_THRESHOLD: usize = 2;
const ALL_STRICT_FUNCTION_THRESHOLD: usize = 3;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StrictFactoryMode {
    /// Every factory is written as is, each strict one carrying its own directive.
    Flat,
    /// The strict factories are grouped into a strict IIFE returning them, followed by the
    /// non-strict factories.
    Mixed,
    /// Every factory is strict, and the whole chunk is wrapped in a strict function.
    AllStrict,
}

/// Selects the smallest representation for this chunk's mix of module factories.
///
/// The chunk items must be sorted with all strict items first, see
/// [`EcmascriptChunkContent::chunk_item_code_module_ids_and_paths`](crate::chunk::EcmascriptChunkContent::chunk_item_code_module_ids_and_paths).
pub fn strict_factory_mode(
    chunk_items: &[CodeModuleIdAndPath],
    supports_arrow_functions: bool,
) -> StrictFactoryMode {
    let strict = chunk_items.iter().filter(|item| item.strict).count();
    let non_strict = chunk_items.len() - strict;
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
    (mode == StrictFactoryMode::AllStrict).then_some((
        if supports_arrow_functions {
            ALL_STRICT_ARROW_PREFIX
        } else {
            ALL_STRICT_FUNCTION_PREFIX
        },
        ALL_STRICT_SUFFIX,
    ))
}

const fn mixed_prefix(supports_arrow_functions: bool) -> &'static str {
    if supports_arrow_functions {
        MIXED_ARROW_PREFIX
    } else {
        MIXED_FUNCTION_PREFIX
    }
}

/// Writes the module factories as comma separated array elements (`id,factory,id,factory`),
/// without a leading or trailing comma. In mixed mode the strict factories come first, wrapped in
/// a strict IIFE returning them.
///
/// Every strict factory carries its own `"use strict"` directive. Where the layout places it in
/// a strict context anyway (inside the mixed IIFE, or in an all-strict chunk), the directive is
/// left out (see [`CodeBuilder::push_code_without_strict_directive`]).
///
/// The chunk items must be sorted with all strict items first.
pub fn write_module_factories(
    code: &mut CodeBuilder,
    chunk_items: &[CodeModuleIdAndPath],
    mode: StrictFactoryMode,
    supports_arrow_functions: bool,
) -> Result<()> {
    debug_assert!(
        chunk_items.is_sorted_by_key(|item| !item.strict),
        "strict chunk items must come first"
    );
    let mut in_strict_group = false;
    for (i, item) in chunk_items.iter().enumerate() {
        if mode == StrictFactoryMode::Mixed && item.strict != in_strict_group {
            if in_strict_group {
                *code += MIXED_SUFFIX;
                *code += ",";
            } else {
                *code += mixed_prefix(supports_arrow_functions);
            }
            in_strict_group = item.strict;
        } else if i > 0 {
            *code += ",";
        }
        write!(code, "{},", StringifyJs(&item.id))?;
        if item.strict && mode != StrictFactoryMode::Flat {
            code.push_code_without_strict_directive(&item.code);
        } else {
            code.push_code(&item.code);
        }
    }
    if in_strict_group {
        *code += MIXED_SUFFIX;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use turbo_tasks::ReadRef;
    use turbopack_core::{chunk::ModuleId, code_builder::STRICT_DIRECTIVE};

    use super::*;

    /// `threshold` must be the smallest factory count worth grouping: one below it the directives
    /// do not outweigh the wrapper, at the threshold they do.
    fn assert_threshold(threshold: usize, wrapper_len: usize) {
        assert!((threshold - 1) * STRICT_DIRECTIVE.len() <= wrapper_len);
        assert!(threshold * STRICT_DIRECTIVE.len() > wrapper_len);
    }

    #[test]
    fn strict_thresholds_match_wrapper_sizes() {
        assert_threshold(
            MIXED_STRICT_THRESHOLD,
            MIXED_ARROW_PREFIX.len() + MIXED_SUFFIX.len(),
        );
        assert_threshold(
            MIXED_STRICT_THRESHOLD,
            MIXED_FUNCTION_PREFIX.len() + MIXED_SUFFIX.len(),
        );
        assert_threshold(
            ALL_STRICT_ARROW_THRESHOLD,
            ALL_STRICT_ARROW_PREFIX.len() + ALL_STRICT_SUFFIX.len(),
        );
        assert_threshold(
            ALL_STRICT_FUNCTION_THRESHOLD,
            ALL_STRICT_FUNCTION_PREFIX.len() + ALL_STRICT_SUFFIX.len(),
        );
    }

    /// A strict factory `s` carries a recorded directive, a non-strict one `n` does not.
    fn item(id: u64, strict: bool) -> CodeModuleIdAndPath {
        let mut code = CodeBuilder::new(false, false);
        if strict {
            code += "(()=>{";
            code.push_strict_directive();
            code += "s})";
        } else {
            code += "(()=>{n})";
        }
        CodeModuleIdAndPath {
            id: ModuleId::Number(id),
            code: ReadRef::new_owned(code.build()),
            path: Default::default(),
            strict,
        }
    }

    fn write(items: &[CodeModuleIdAndPath]) -> String {
        let mode = strict_factory_mode(items, true);
        let wrapper = strict_chunk_wrapper(mode, true);
        let mut code = CodeBuilder::new(false, false);
        if let Some((prefix, _)) = wrapper {
            code += prefix;
        }
        code += "[";
        write_module_factories(&mut code, items, mode, true).unwrap();
        code += "]";
        if let Some((_, suffix)) = wrapper {
            code += suffix;
        }
        code.build().source_code().to_str().unwrap().into_owned()
    }

    #[test]
    fn layouts() {
        assert_eq!(write(&[]), "[]");
        assert_eq!(
            write(&[item(1, false), item(2, false)]),
            "[1,(()=>{n}),2,(()=>{n})]"
        );
        // Below the thresholds, strict factories keep their own directives.
        assert_eq!(
            write(&[item(1, true), item(2, false)]),
            "[1,(()=>{\"use strict\";s}),2,(()=>{n})]"
        );
        assert_eq!(write(&[item(1, true)]), "[1,(()=>{\"use strict\";s})]");
        // In a strict wrapper, they don't.
        assert_eq!(
            write(&[item(1, true), item(2, true), item(3, true), item(4, false)]),
            "[(()=>{\"use strict\";return[1,(()=>{s}),2,(()=>{s}),3,(()=>{s})]})(),4,(()=>{n})]"
        );
        assert_eq!(
            write(&[item(1, true), item(2, true)]),
            "(()=>{\"use strict\";[1,(()=>{s}),2,(()=>{s})]})()"
        );
    }
}
