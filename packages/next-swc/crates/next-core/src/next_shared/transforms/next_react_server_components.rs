use anyhow::Result;
use async_trait::async_trait;
use next_custom_transforms::transforms::react_server_components::*;
use swc_core::{
    common::FileName,
    ecma::{ast::Program, visit::VisitWith},
};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::ecmascript::{
    CustomTransformer, TransformContext, TransformPlugin,
};

/// Applies the Next.js react server components transform.
/// This transform owns responsibility to assert various import / usage
/// conditions against each code's context. Refer below table how we are
/// applying these rules against various contexts.
///
/// | Context         | Enabled | isReactServerLayer |
/// |-----------------|---------|--------------------|
/// | SSR             | true    | false              |
/// | Client          | true    | false              |
/// | Middleware      | false   | false              |
/// | Api             | false   | false              |
/// | RSC             | true    | true               |
/// | Pages           | true    | false              |
pub fn get_next_react_server_components_transform_plugin(
    is_react_server_layer: bool,
    app_dir: Option<Vc<FileSystemPath>>,
) -> Vc<TransformPlugin> {
    Vc::cell(Box::new(NextJsReactServerComponents::new(
        is_react_server_layer,
        app_dir,
    )) as _)
}

#[derive(Debug)]
struct NextJsReactServerComponents {
    is_react_server_layer: bool,
    app_dir: Option<Vc<FileSystemPath>>,
}

impl NextJsReactServerComponents {
    fn new(is_react_server_layer: bool, app_dir: Option<Vc<FileSystemPath>>) -> Self {
        Self {
            is_react_server_layer,
            app_dir,
        }
    }
}

#[async_trait]
impl CustomTransformer for NextJsReactServerComponents {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let file_name = if ctx.file_path_str.is_empty() {
            FileName::Anon
        } else {
            FileName::Real(ctx.file_path_str.into())
        };

        let mut visitor = server_components_assert(
            file_name,
            Config::WithOptions(Options {
                is_react_server_layer: self.is_react_server_layer,
            }),
            match self.app_dir {
                None => None,
                Some(path) => Some(path.await?.path.clone().into()),
            },
        );

        program.visit_with(&mut visitor);
        Ok(())
    }
}
