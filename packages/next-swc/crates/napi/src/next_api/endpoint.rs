use std::ops::Deref;

use napi::{bindgen_prelude::External, JsFunction};
use next_api::route::{Endpoint, WrittenEndpoint};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::core::error::PrettyPrintError;

use super::utils::{subscribe, NapiDiagnostic, NapiIssue, RootTask, VcArc};

#[napi(object)]
pub struct NapiWrittenEndpoint {
    pub server_entry_path: String,
    pub server_paths: Vec<String>,
    pub issues: Vec<NapiIssue>,
    pub diagnostics: Vec<NapiDiagnostic>,
}

impl From<&WrittenEndpoint> for NapiWrittenEndpoint {
    fn from(written_endpoint: &WrittenEndpoint) -> Self {
        Self {
            server_entry_path: written_endpoint.server_entry_path.clone(),
            server_paths: written_endpoint.server_paths.clone(),
            issues: vec![],
            diagnostics: vec![],
        }
    }
}

// NOTE(alexkirsz) We go through an extra layer of indirection here because of
// two factors:
// 1. rustc currently has a bug where using a dyn trait as a type argument to
//    some async functions (in this case `endpoint_write_to_disk`) can cause
//    higher-ranked lifetime errors. See https://github.com/rust-lang/rust/issues/102211
// 2. the type_complexity clippy lint.
pub struct ExternalEndpoint(pub VcArc<Vc<Box<dyn Endpoint>>>);

impl Deref for ExternalEndpoint {
    type Target = VcArc<Vc<Box<dyn Endpoint>>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[napi]
pub async fn endpoint_write_to_disk(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
) -> napi::Result<NapiWrittenEndpoint> {
    let turbo_tasks = endpoint.turbo_tasks().clone();
    let endpoint = ***endpoint;
    let written = turbo_tasks
        .run_once(async move { endpoint.write_to_disk().strongly_consistent().await })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    // TODO peek_issues and diagnostics
    Ok((&*written).into())
}

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn endpoint_changed_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<
        VcArc<Vc<Box<dyn Endpoint>>>,
    >,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbo_tasks = endpoint.turbo_tasks().clone();
    let endpoint = **endpoint;
    subscribe(
        turbo_tasks,
        func,
        move || async move {
            endpoint.changed().await?;
            // TODO peek_issues and diagnostics
            Ok(())
        },
        |_ctx| Ok(vec![()]),
    )
}
