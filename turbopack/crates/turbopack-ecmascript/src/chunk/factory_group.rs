use std::{io::Write, ops::AddAssign};

use anyhow::Result;
use turbopack_core::code_builder::{CodeBuilder, ComposedCodeBuilder};

use crate::{chunk::CodeModuleIdAndPath, utils::StringifyJs};

/// Where [`write_module_factories`] writes to.
pub trait ModuleFactorySink: Write + AddAssign<&'static str> {
    fn push_factory(&mut self, item: &CodeModuleIdAndPath);
}

impl ModuleFactorySink for CodeBuilder {
    fn push_factory(&mut self, item: &CodeModuleIdAndPath) {
        self.push_code(&item.code);
    }
}

/// References each factory's cells, so that the chunk's persisted representation doesn't copy
/// them.
impl ModuleFactorySink for ComposedCodeBuilder {
    fn push_factory(&mut self, item: &CodeModuleIdAndPath) {
        match &item.cells {
            Some(cells) => self.push_code_cells(cells, &item.code),
            None => self.push_code(&item.code),
        }
    }
}

// The chunk scaffolding is written in minified form in every mode, so a chunk whose factories
// are minified individually needs no further minification pass.
const MIXED_ARROW_PREFIX: &str = "(()=>{\"use strict\";return[";
const MIXED_FUNCTION_PREFIX: &str = "(function(){\"use strict\";return[";
const MIXED_SUFFIX: &str = "]})()";
/// File-level directive making a whole chunk strict. Browser chunks are standalone classic
/// scripts and Node.js chunks run inside the CommonJS function wrapper, so a directive at the
/// very start of the chunk applies to every factory in it.
///
/// A consumer that concatenates chunks must do so into a strict context, since the directive
/// is only a directive at the very start of a script or function (e.g. concatenating browser
/// chunks into an ES module is fine, as modules are always strict).
const ALL_STRICT_PREFIX: &str = "\"use strict\";";

/// Minimum number of strict factories that makes hoisting the directive worth its wrapper, when
/// every strict factory carries its own `"use strict"` directive. Derived from the wrapper sizes
/// and pinned by `strict_thresholds_match_wrapper_sizes`. The mixed wrappers differ in length but
/// land on the same minimum.
const MIXED_STRICT_THRESHOLD: usize = 3;
const ALL_STRICT_THRESHOLD: usize = 2;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StrictFactoryMode {
    /// Every factory is written as is, each strict one carrying its own directive.
    Flat,
    /// The strict factories are grouped into a strict IIFE returning them, followed by the
    /// non-strict factories.
    Mixed,
    /// Every factory is strict, and the chunk starts with a file-level `"use strict"` directive.
    AllStrict,
}

/// Selects the smallest representation for this chunk's mix of module factories.
///
/// `factories_have_directives` is false when strict factories had their own `"use strict"`
/// directive removed (per-item minification). They must then always be placed in a strict
/// context, so strict factories are grouped regardless of the thresholds.
///
/// The chunk items must be sorted with all strict items first, see
/// [`EcmascriptChunkContent::chunk_item_code_module_ids_and_paths`](crate::chunk::EcmascriptChunkContent::chunk_item_code_module_ids_and_paths).
pub fn strict_factory_mode(
    chunk_items: &[CodeModuleIdAndPath],
    factories_have_directives: bool,
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
    let threshold = match mode {
        _ if !factories_have_directives => 1,
        StrictFactoryMode::Mixed => MIXED_STRICT_THRESHOLD,
        StrictFactoryMode::AllStrict => ALL_STRICT_THRESHOLD,
        StrictFactoryMode::Flat => unreachable!(),
    };
    if strict >= threshold {
        mode
    } else {
        StrictFactoryMode::Flat
    }
}

/// Code written at the very start of the chunk, before anything else.
pub fn strict_chunk_prefix(mode: StrictFactoryMode) -> Option<&'static str> {
    (mode == StrictFactoryMode::AllStrict).then_some(ALL_STRICT_PREFIX)
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
/// The chunk items must be sorted with all strict items first.
pub fn write_module_factories(
    code: &mut impl ModuleFactorySink,
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
        code.push_factory(item);
    }
    if in_strict_group {
        *code += MIXED_SUFFIX;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use turbo_tasks::ReadRef;
    use turbopack_core::chunk::ModuleId;

    use super::*;

    /// Length of the `"use strict";` directive that `EcmascriptChunkItemContent::module_factory`
    /// writes into every strict factory, and that the minimizer removes again inside a strict
    /// wrapper. Kept here because only these assertions need it.
    const STRICT_MODE_DIRECTIVE_LEN: usize = "\"use strict\";".len();

    /// `threshold` must be the smallest factory count worth grouping: one below it the directives
    /// do not outweigh the wrapper, at the threshold they do.
    fn assert_threshold(threshold: usize, wrapper_len: usize) {
        assert!((threshold - 1) * STRICT_MODE_DIRECTIVE_LEN <= wrapper_len);
        assert!(threshold * STRICT_MODE_DIRECTIVE_LEN > wrapper_len);
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
        assert_threshold(ALL_STRICT_THRESHOLD, ALL_STRICT_PREFIX.len());
    }

    fn item(id: u64, strict: bool) -> CodeModuleIdAndPath {
        let mut code = CodeBuilder::new(false, false);
        code += if strict { "s" } else { "n" };
        CodeModuleIdAndPath {
            id: ModuleId::Number(id),
            code: ReadRef::new_owned(code.build()),
            cells: None,
            path: Default::default(),
            strict,
        }
    }

    fn write(items: &[CodeModuleIdAndPath], factories_have_directives: bool) -> String {
        let mode = strict_factory_mode(items, factories_have_directives);
        let mut code = CodeBuilder::new(false, false);
        if let Some(prefix) = strict_chunk_prefix(mode) {
            code += prefix;
        }
        code += "[";
        write_module_factories(&mut code, items, mode, true).unwrap();
        code += "]";
        code.build().source_code().to_str().unwrap().into_owned()
    }

    #[test]
    fn layouts() {
        assert_eq!(write(&[], true), "[]");
        assert_eq!(write(&[item(1, false), item(2, false)], true), "[1,n,2,n]");
        // Below the threshold, strict factories keep their own directives.
        assert_eq!(write(&[item(1, true), item(2, false)], true), "[1,s,2,n]");
        assert_eq!(write(&[item(1, true)], true), "[1,s]");
        // Without directives, strict factories are always grouped.
        assert_eq!(
            write(&[item(1, true), item(2, false)], false),
            "[(()=>{\"use strict\";return[1,s]})(),2,n]"
        );
        assert_eq!(write(&[item(1, true)], false), "\"use strict\";[1,s]");
        assert_eq!(
            write(
                &[item(1, true), item(2, true), item(3, true), item(4, false)],
                true
            ),
            "[(()=>{\"use strict\";return[1,s,2,s,3,s]})(),4,n]"
        );
        assert_eq!(
            write(&[item(1, true), item(2, true)], true),
            "\"use strict\";[1,s,2,s]"
        );
    }
}
