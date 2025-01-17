use std::io::Write;

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::{rope::RopeBuilder, File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    source::Source,
};
use turbopack_ecmascript::utils::StringifyJs;

/// The `process.env` asset, responsible for initializing the env (shared by all
/// chunks) during app startup.
#[turbo_tasks::value]
pub struct ProcessEnvAsset {
    /// The root path which we can construct our env asset path.
    root: ResolvedVc<FileSystemPath>,

    /// A HashMap filled with the env key/values.
    env: ResolvedVc<Box<dyn ProcessEnv>>,
}

#[turbo_tasks::value_impl]
impl ProcessEnvAsset {
    #[turbo_tasks::function]
    pub async fn new(
        root: ResolvedVc<FileSystemPath>,
        env: ResolvedVc<Box<dyn ProcessEnv>>,
    ) -> Result<Vc<Self>> {
        Ok(ProcessEnvAsset { root, env }.cell())
    }
}

#[turbo_tasks::value_impl]
impl Source for ProcessEnvAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(self.root.join(".env.js".into()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ProcessEnvAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let env = self.env.read_all().await?;

        // TODO: In SSR, we use the native process.env, which can only contain string
        // values. We need to inject literal values (to emulate webpack's
        // DefinePlugin), so create a new regular object out of the old env.
        let mut code = RopeBuilder::default();
        code += "const env = process.env = {...process.env};\n\n";

        for (name, val) in &*env {
            // It's assumed the env has passed through an EmbeddableProcessEnv, so the value
            // is ready to be directly embedded. Values _after_ an embeddable
            // env can be used to inject live code into the output.
            // TODO this is not completely correct as env vars need to ignore casing
            // So `process.env.path === process.env.PATH === process.env.PaTh`
            writeln!(code, "env[{}] = {};", StringifyJs(name), val)?;
        }

        Ok(AssetContent::file(File::from(code.build()).into()))
    }
}
