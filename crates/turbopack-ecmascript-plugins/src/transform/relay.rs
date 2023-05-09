use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use swc_core::{
    common::{util::take::Take, FileName},
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbopack_ecmascript::{CustomTransformer, TransformContext};

#[derive(Debug)]
pub struct RelayTransformer {
    config: swc_relay::Config,
}

impl RelayTransformer {
    pub fn new(config: swc_relay::Config) -> Self {
        Self { config }
    }
}

#[async_trait]
impl CustomTransformer for RelayTransformer {
    async fn transform(
        &self,
        program: &mut Program,
        ctx: &TransformContext<'_>,
    ) -> Result<Option<Program>> {
        // If user supplied artifact_directory, it should be resolvable already.
        // Otherwise, supply default relative path (./__generated__)
        let (root, config) = if self.config.artifact_directory.is_some() {
            (PathBuf::new(), None)
        } else {
            let config = swc_relay::Config {
                artifact_directory: Some(PathBuf::from("__generated__")),
                ..self.config
            };
            (PathBuf::from("."), Some(config))
        };

        let p = std::mem::replace(program, Program::Module(Module::dummy()));
        *program = p.fold_with(&mut swc_relay::relay(
            config.as_ref().unwrap_or_else(|| &self.config),
            FileName::Real(PathBuf::from(ctx.file_name_str)),
            root,
            // [TODO]: pages_dir comes through next-swc-loader
            // https://github.com/vercel/next.js/blob/ea472e8058faea8ebdab2ef6d3aab257a1f0d11c/packages/next/src/build/webpack-config.ts#L792
            None,
            Some(ctx.unresolved_mark),
        ));

        Ok(None)
    }
}
