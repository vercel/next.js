//! Explicit development Node tests keep user environment reads mutable. Normal
//! application, production, RSC and browser-driver compilation stays unchanged.

use anyhow::{Result, bail};
use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc};
use turbopack::ModuleAssetContext;
use turbopack_core::compile_time_info::{
    CompileTimeDefineValue, CompileTimeDefines, CompileTimeInfo, DefinableNameSegment,
    FreeVarReferences,
};

use crate::project::Project;

pub(crate) fn validate_request(
    requested: bool,
    environment: &str,
    development: bool,
) -> Result<()> {
    if requested && (environment != "node" || !development) {
        bail!("Mutable test environment requires a development Node entry");
    }
    Ok(())
}

fn environment_name(segments: &[DefinableNameSegment]) -> Option<&RcStr> {
    use DefinableNameSegment::{Name, TypeOf};
    let [Name(process), Name(env), Name(name), rest @ ..] = segments else {
        return None;
    };
    (process.as_str() == "process"
        && env.as_str() == "env"
        && (rest.is_empty() || matches!(rest, [TypeOf])))
    .then_some(name)
}

fn mutable_user_key(name: &str, configured: &FxHashSet<RcStr>) -> bool {
    // These belong to Next's compiler/runtime protocol even if a config env
    // object happens to contain the same name. They retain normal constants.
    !name.starts_with("__")
        && !name.starts_with("NODE_")
        && !matches!(
            name,
            "TURBOPACK"
                | "NEXT_RUNTIME"
                | "NEXT_MINIMAL"
                | "NEXT_DEPLOYMENT_ID"
                | "NEXT_SUPPORTS_IMMUTABLE_ASSETS"
        )
        && (name.starts_with("NEXT_PUBLIC_") || configured.contains(name))
}

fn initial_bindings(
    defines: &FxIndexMap<Vec<DefinableNameSegment>, CompileTimeDefineValue>,
    configured: &FxHashSet<RcStr>,
) -> Result<Vec<(RcStr, RcStr)>> {
    let mut bindings = Vec::new();
    for (segments, value) in defines {
        if segments.len() != 3 {
            continue;
        }
        let Some(name) = environment_name(segments) else {
            continue;
        };
        if !mutable_user_key(name, configured) {
            continue;
        }
        let CompileTimeDefineValue::String(value) = value else {
            bail!("Mutable test environment requires a string initial define for {name}");
        };
        if name.is_empty() || name.contains(['\0', '=']) || value.contains('\0') {
            bail!("Mutable test environment cannot initialize process.env for {name}");
        }
        bindings.push((name.clone(), value.clone()));
    }
    bindings.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    Ok(bindings)
}

async fn bindings(project: ResolvedVc<Project>) -> Result<Vec<(RcStr, RcStr)>> {
    let context = project.node_test_context().await?;
    let info = context.compile_time_info.await?;
    let configured = project.next_config().env().await?.keys().cloned().collect();
    initial_bindings(&*info.defines.await?, &configured)
}

/// Clone only the explicit Node test context. Both analyzer constants and
/// free-variable replacements must release the same keys or a read can still
/// fold to its initial value (including `typeof` checks after an unset stub).
#[turbo_tasks::function]
pub(crate) async fn context(project: ResolvedVc<Project>) -> Result<Vc<ModuleAssetContext>> {
    if !project.next_mode().await?.is_development() {
        bail!("Mutable test environment requires a development Node entry");
    }
    let base = project.node_test_context().await?;
    let info = base.compile_time_info.await?;
    let names: FxHashSet<_> = bindings(project)
        .await?
        .into_iter()
        .map(|(name, _)| name)
        .collect();
    let mut defines = info.defines.owned().await?;
    defines
        .retain(|segments, _| !environment_name(segments).is_some_and(|name| names.contains(name)));
    let mut free_vars = info.free_var_references.owned().await?;
    free_vars
        .retain(|segments, _| !environment_name(segments).is_some_and(|name| names.contains(name)));
    let info = CompileTimeInfo {
        environment: info.environment,
        defines: CompileTimeDefines(defines).resolved_cell(),
        free_var_references: FreeVarReferences(free_vars).resolved_cell(),
        hot_module_replacement_enabled: info.hot_module_replacement_enabled,
        import_meta_env_base_url: info.import_meta_env_base_url.clone(),
    }
    .cell();
    Ok(ModuleAssetContext::new(
        *base.transitions,
        info,
        *base.module_options_context,
        *base.resolve_options_context,
        base.layer.clone(),
    ))
}

/// Seed exact compiler-issued strings before any bundled setup/test module is
/// evaluated. Array pairs avoid object-literal `__proto__` behavior. The worker
/// owns this real process.env; normal attempt utilities restore each stub.
pub(crate) async fn bootstrap(project: ResolvedVc<Project>) -> Result<String> {
    let values = serde_json::to_string(&bindings(project).await?)?;
    Ok(format!(
        "for (const [name, value] of {values}) process.env[name] = value;\n"
    ))
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbopack_core::compile_time_info::{CompileTimeDefineValue, DefinableNameSegment};

    use crate::testing_env::{
        environment_name, initial_bindings, mutable_user_key, validate_request,
    };

    fn key(name: &str) -> Vec<DefinableNameSegment> {
        vec!["process".into(), "env".into(), name.into()]
    }

    #[test]
    fn requested_environment_has_explicit_development_node_scope() {
        assert!(validate_request(true, "node", true).is_ok());
        for (environment, development) in [("node", false), ("rsc", true), ("browser", true)] {
            assert!(validate_request(true, environment, development).is_err());
            assert!(validate_request(false, environment, development).is_ok());
        }
    }

    #[test]
    fn user_bindings_preserve_exact_initial_strings_and_internal_constants() {
        let configured = [
            rcstr!("CONFIG_ONLY"),
            rcstr!("TURBOPACK"),
            rcstr!("__NEXT_FLAG"),
        ]
        .into_iter()
        .collect();
        let defines = [
            (key("NEXT_PUBLIC_VALUE"), "public\n\"value".into()),
            (key("CONFIG_ONLY"), "configured".into()),
            (key("TURBOPACK"), true.into()),
            (key("__NEXT_FLAG"), false.into()),
            (key("NODE_ENV"), "development".into()),
            (key("UNRELATED"), "unchanged".into()),
        ]
        .into_iter()
        .collect();
        assert_eq!(
            initial_bindings(&defines, &configured).unwrap(),
            vec![
                (rcstr!("CONFIG_ONLY"), rcstr!("configured")),
                (rcstr!("NEXT_PUBLIC_VALUE"), rcstr!("public\n\"value")),
            ]
        );
        for name in [
            "NODE_ENV",
            "__NEXT_FLAG",
            "TURBOPACK",
            "NEXT_RUNTIME",
            "NEXT_DEPLOYMENT_ID",
        ] {
            assert!(!mutable_user_key(name, &configured));
        }
    }

    #[test]
    fn user_bindings_reject_initial_kinds_that_process_env_would_coerce() {
        for value in [
            CompileTimeDefineValue::Bool(false),
            CompileTimeDefineValue::Null,
            CompileTimeDefineValue::Undefined,
            CompileTimeDefineValue::Evaluate(rcstr!("unknown()")),
        ] {
            let defines = [(key("NEXT_PUBLIC_VALUE"), value)].into_iter().collect();
            assert!(initial_bindings(&defines, &Default::default()).is_err());
        }
    }

    #[test]
    fn same_key_releases_direct_and_typeof_replacements_only() {
        let direct = key("NEXT_PUBLIC_VALUE");
        let mut type_of = direct.clone();
        type_of.push(DefinableNameSegment::TypeOf);
        assert_eq!(
            environment_name(&direct),
            Some(&rcstr!("NEXT_PUBLIC_VALUE"))
        );
        assert_eq!(
            environment_name(&type_of),
            Some(&rcstr!("NEXT_PUBLIC_VALUE"))
        );
        let mut nested = direct;
        nested.push("length".into());
        assert_eq!(environment_name(&nested), None);
    }
}
