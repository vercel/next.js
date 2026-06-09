use std::{
    hash::{Hash, Hasher},
    sync::LazyLock,
};

use anyhow::{Result, bail};
use turbo_esregex::EsRegex;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, Vc};

use crate::{
    analyzer::{ConstantValue, JsValue},
    references::require_context::RequireContextMap,
};

#[derive(Debug, Clone)]
pub struct RequireContextOptions {
    pub dir: RcStr,
    pub include_subdirs: bool,
    /// this is a regex (pattern, flags)
    pub filter: EsRegex,
}

/// Parse the arguments passed to a require.context invocation, validate them
/// and convert them to the appropriate rust values.
pub fn parse_require_context(args: &[JsValue<'_>]) -> Result<RequireContextOptions> {
    if !(1..=3).contains(&args.len()) {
        // https://linear.app/vercel/issue/WEB-910/add-support-for-requirecontexts-mode-argument
        bail!("require.context() only supports 1-3 arguments (mode is not supported)");
    }

    let Some(dir) = args[0].as_str().map(|s| s.into()) else {
        bail!("require.context(dir, ...) requires dir to be a constant string");
    };

    let include_subdirs = if let Some(include_subdirs) = args.get(1) {
        if let Some(include_subdirs) = include_subdirs.as_bool() {
            include_subdirs
        } else {
            bail!(
                "require.context(..., includeSubdirs, ...) requires includeSubdirs to be a \
                 constant boolean",
            );
        }
    } else {
        true
    };

    let filter = if let Some(filter) = args.get(2) {
        if let JsValue::Constant(ConstantValue::Regex(box (pattern, flags))) = filter {
            EsRegex::new(pattern, flags)?
        } else {
            bail!("require.context(..., ..., filter) requires filter to be a regex");
        }
    } else {
        // https://webpack.js.org/api/module-methods/#requirecontext
        // > optional, default /^\.\/.*$/, any file
        static DEFAULT_REGEX: LazyLock<EsRegex> =
            LazyLock::new(|| EsRegex::new(r"^\./.*$", "").unwrap());

        DEFAULT_REGEX.clone()
    };

    Ok(RequireContextOptions {
        dir,
        include_subdirs,
        filter,
    })
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct RequireContextValue(pub(crate) FxIndexMap<RcStr, RcStr>);

impl RequireContextValue {
    pub async fn from_context_map(map: Vc<RequireContextMap>) -> Result<Self> {
        let mut context_map = FxIndexMap::default();

        for (key, entry) in map.await?.iter() {
            context_map.insert(key.clone(), entry.origin_relative.clone());
        }

        Ok(RequireContextValue(context_map))
    }
}

impl Hash for RequireContextValue {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.len().hash(state);
        for (i, (k, v)) in self.0.iter().enumerate() {
            i.hash(state);
            k.hash(state);
            v.hash(state);
        }
    }
}
