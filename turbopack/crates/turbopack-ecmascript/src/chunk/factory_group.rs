use std::io::Write;

use anyhow::Result;
use turbo_tasks::ReadRef;
use turbopack_core::code_builder::CodeBuilder;

use crate::{
    chunk::{CodeModuleIdsAndPaths, ModuleFactoryMode},
    utils::StringifyJs,
};

/// Strict-mode directive emitted by a module factory. It is omitted from factories that a chunk
/// creates inside a strict context.
pub const STRICT_MODE_DIRECTIVE: &str = "\"use strict\";\n\n";

/// Wraps the strict factories of a mixed chunk in an array returned by a strict IIFE.
const MIXED_ARROW_PREFIX: &str = "\n(()=>{\"use strict\";return[";
const MIXED_FUNCTION_PREFIX: &str = "\n(function(){\"use strict\";return[";
const MIXED_SUFFIX: &str = "\n]})(),";
/// Wraps the whole chunk of an all-strict chunk in a strict IIFE.
const ALL_STRICT_ARROW_PREFIX: &str = "(()=>{\"use strict\";";
const ALL_STRICT_FUNCTION_PREFIX: &str = "(function(){\"use strict\";";
const ALL_STRICT_SUFFIX: &str = "})()";

/// How a chunk emits the strict-mode directive of its module factories.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StrictFactoryMode {
    /// Every factory carries its own directive, in one flat factory sequence.
    Flat,
    /// Non-strict factories stay in the flat sequence; the strict ones are appended as an array
    /// returned by a strict IIFE.
    Mixed,
    /// All factories are strict, so the whole chunk is wrapped in a strict IIFE and the factories
    /// stay in one flat sequence.
    AllStrict,
}

impl StrictFactoryMode {
    /// Code the chunk emitter has to write before the chunk, if any.
    pub fn chunk_prefix(self, supports_arrow_functions: bool) -> Option<&'static str> {
        match self {
            Self::AllStrict if supports_arrow_functions => Some(ALL_STRICT_ARROW_PREFIX),
            Self::AllStrict => Some(ALL_STRICT_FUNCTION_PREFIX),
            Self::Flat | Self::Mixed => None,
        }
    }

    /// Code the chunk emitter has to write after the chunk, if any.
    pub fn chunk_suffix(self) -> Option<&'static str> {
        match self {
            Self::AllStrict => Some(ALL_STRICT_SUFFIX),
            Self::Flat | Self::Mixed => None,
        }
    }

    /// Whether the factories have to be generated without their strict-mode directive.
    pub fn omits_use_strict(self) -> bool {
        self != Self::Flat
    }

    fn wrapper_len(self, supports_arrow_functions: bool) -> usize {
        match self {
            Self::Flat => 0,
            Self::Mixed => mixed_prefix(supports_arrow_functions).len() + MIXED_SUFFIX.len(),
            Self::AllStrict => {
                self.chunk_prefix(supports_arrow_functions)
                    .map_or(0, str::len)
                    + ALL_STRICT_SUFFIX.len()
            }
        }
    }
}

/// Selects the smallest emitted representation for this chunk's mix of module factories: hoisting
/// the directive only pays off once it saves more bytes than the wrapper it adds.
pub fn strict_factory_mode(
    chunk_items: &[ReadRef<CodeModuleIdsAndPaths>],
    supports_arrow_functions: bool,
) -> StrictFactoryMode {
    let mut strict_factory_count = 0usize;
    let mut non_strict_factory_count = 0usize;
    for item in chunk_items {
        for (_, _, _, mode) in &***item {
            if mode.is_strict() {
                strict_factory_count += 1;
            } else {
                non_strict_factory_count += 1;
            }
        }
    }
    if strict_factory_count == 0 {
        return StrictFactoryMode::Flat;
    }

    let mode = if non_strict_factory_count == 0 {
        StrictFactoryMode::AllStrict
    } else {
        StrictFactoryMode::Mixed
    };
    let saved = strict_factory_count * STRICT_MODE_DIRECTIVE.len();
    if saved > mode.wrapper_len(supports_arrow_functions) {
        mode
    } else {
        StrictFactoryMode::Flat
    }
}

const fn mixed_prefix(supports_arrow_functions: bool) -> &'static str {
    if supports_arrow_functions {
        MIXED_ARROW_PREFIX
    } else {
        MIXED_FUNCTION_PREFIX
    }
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
/// In a mixed chunk the non-strict factories stay in the flat sequence and the strict ones are
/// appended as an array returned by a strict IIFE. An all-strict chunk is wrapped in a strict IIFE
/// by the chunk emitter (see [`StrictFactoryMode::chunk_prefix`]), so its factories stay flat here.
pub fn write_module_factories(
    code: &mut CodeBuilder,
    chunk_items: &[ReadRef<CodeModuleIdsAndPaths>],
    mode: StrictFactoryMode,
    supports_arrow_functions: bool,
) -> Result<()> {
    if mode == StrictFactoryMode::Mixed {
        write_factories(code, chunk_items, |factory_mode| !factory_mode.is_strict())?;
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
