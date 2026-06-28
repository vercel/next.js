use std::collections::BTreeSet;

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use either::Either;
use next_core::{get_next_package, next_server::get_tracing_compile_time_info};
use serde_json::json;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, File, FileContent, FileSystemPath, glob::Glob,
};
use turbo_tasks_hash::HashAlgorithm;
use turbopack::externals_tracing_module_context;
use turbopack_core::{
    asset::{Asset, AssetContent},
    module::{Module, Modules},
    module_graph::{GraphEntries, ModuleGraph, SingleModuleGraph},
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
    reference_type::CommonJsReferenceSubType,
    resolve::{ResolveErrorMode, origin::PlainResolveOrigin, parse::Request},
};
use turbopack_resolve::ecmascript::cjs_resolve;

use crate::{nft::traced_modules_for_entries, project::Project};

#[turbo_tasks::task_input]
#[derive(PartialEq, Eq, TraceRawVcs, Debug, Clone, Hash, Encode, Decode)]
enum ServerNftType {
    Minimal,
    Full,
}

#[turbo_tasks::function]
pub async fn next_server_nft_assets(project: Vc<Project>) -> Result<Vc<OutputAssets>> {
    if *project.next_config().is_using_adapter().await? {
        // When using an adapter, we don't need to generate any server NFTs as build-complete
        // doesn't use them at all.
        return Ok(Vc::cell(vec![]));
    }

    let has_next_support = *project.ci_has_next_support().await?;
    let is_standalone = *project.next_config().is_standalone().await?;

    let minimal = ResolvedVc::upcast(
        ServerNftJsonAsset::new(project, ServerNftType::Minimal)
            .to_resolved()
            .await?,
    );

    if has_next_support && !is_standalone {
        // When deploying to Vercel, we only need next-minimal-server.js.nft.json
        Ok(Vc::cell(vec![minimal]))
    } else {
        Ok(Vc::cell(vec![
            minimal,
            ResolvedVc::upcast(
                ServerNftJsonAsset::new(project, ServerNftType::Full)
                    .to_resolved()
                    .await?,
            ),
        ]))
    }
}

#[turbo_tasks::value]
pub struct ServerNftJsonAsset {
    project: ResolvedVc<Project>,
    ty: ServerNftType,
}

#[turbo_tasks::value_impl]
impl ServerNftJsonAsset {
    #[turbo_tasks::function]
    pub fn new(project: ResolvedVc<Project>, ty: ServerNftType) -> Vc<Self> {
        ServerNftJsonAsset { project, ty }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for ServerNftJsonAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for ServerNftJsonAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let name = match self.ty {
            ServerNftType::Minimal => "next-minimal-server.js.nft.json",
            ServerNftType::Full => "next-server.js.nft.json",
        };

        Ok(self.project.node_root().await?.join(name)?.cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for ServerNftJsonAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;

        // Example: [project]/apps/my-website/.next/
        let base_dir = this
            .project
            .project_root_path()
            .await?
            .join(&this.project.node_root().await?.path)?;

        let module_graph = ModuleGraph::from_graphs(
            vec![SingleModuleGraph::new_with_entries(
                GraphEntries::new(vec![], self.entries().owned().await?).resolved_cell(),
                true,
                false,
            )],
            None,
        )
        .connect();

        let mut server_output_assets = traced_modules_for_entries(
            module_graph,
            Modules::empty(),
            self.entries(),
            Some(self.ignores()),
            None,
        )
        .await?
        .iter()
        .map(async |m| {
            Ok((
                base_dir
                    .get_relative_path_to(&m.ident().await?.path)
                    .context("failed to compute relative path for server NFT JSON")?,
                m.source()
                    .await?
                    .context("NFT module has no content")?
                    .content()
                    .hash(HashAlgorithm::Xxh3Hash128Hex)
                    .await?,
            ))
        })
        .try_join()
        .await?;

        let next_dir = get_next_package(this.project.project_path().owned().await?).await?;
        for ty in ["app-page", "pages"] {
            let dir = next_dir.join(&format!("dist/server/route-modules/{ty}"))?;
            let module_path = dir.join("module.compiled.js")?;
            server_output_assets.push((
                base_dir
                    .get_relative_path_to(&module_path)
                    .context("failed to compute relative path for server NFT JSON")?,
                module_path
                    .read()
                    .hash(HashAlgorithm::Xxh3Hash128Hex)
                    .await?,
            ));

            let contexts_dir = dir.join("vendored/contexts")?;
            let DirectoryContent::Entries(contexts_files) = &*contexts_dir.read_dir().await? else {
                bail!(
                    "Expected contexts directory to be a directory, found: {:?}",
                    contexts_dir
                );
            };
            for (_, entry) in contexts_files {
                let DirectoryEntry::File(file) = entry else {
                    continue;
                };
                if file.extension() == Some("js") {
                    server_output_assets.push((
                        base_dir
                            .get_relative_path_to(file)
                            .context("failed to compute relative path for server NFT JSON")?,
                        file.read().hash(HashAlgorithm::Xxh3Hash128Hex).await?,
                    ))
                }
            }
        }

        server_output_assets.sort_unstable();
        // Dedupe as some entries may be duplicates: a file might be referenced multiple times,
        // e.g. as a RawModule (from an FS operation) and as an EcmascriptModuleAsset because it
        // was required.
        server_output_assets.dedup();

        let (files, file_hashes): (Vec<_>, Vec<_>) = server_output_assets.into_iter().unzip();
        let json = json!({
            "version": 1,
            "files": files,
            "fileHashes": file_hashes
        });

        Ok(AssetContent::file(
            FileContent::Content(File::from(json.to_string())).cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ServerNftJsonAsset {
    #[turbo_tasks::function]
    async fn entries(&self) -> Result<Vc<Modules>> {
        let is_standalone = *self.project.next_config().is_standalone().await?;

        let asset_context = Vc::upcast(externals_tracing_module_context(
            get_tracing_compile_time_info(),
            false,
        ));

        let project_path = self.project.project_path().owned().await?;

        let next_resolve_origin = Vc::upcast(PlainResolveOrigin::new(
            asset_context,
            get_next_package(project_path.clone()).await?.join("_")?,
        ));

        // These are used by packages/next/src/server/require-hook.ts
        let shared_entries = ["styled-jsx", "styled-jsx/style", "styled-jsx/style.js"];

        let entries = match self.ty {
            ServerNftType::Full => Either::Left(
                if is_standalone {
                    Either::Left(
                        [
                            "next/dist/server/lib/start-server",
                            "next/dist/server/next",
                            "next/dist/server/require-hook",
                        ]
                        .into_iter(),
                    )
                } else {
                    Either::Right(std::iter::empty())
                }
                .chain(std::iter::once("next/dist/server/next-server")),
            ),
            ServerNftType::Minimal => Either::Right(std::iter::once(
                "next/dist/compiled/next-server/server.runtime.prod",
            )),
        };

        Ok(Vc::cell(
            shared_entries
                .into_iter()
                .chain(entries)
                .map(async |path| {
                    Ok(cjs_resolve(
                        next_resolve_origin,
                        Request::parse_string(path.into()),
                        CommonJsReferenceSubType::Undefined,
                        None,
                        ResolveErrorMode::Error,
                    )
                    .await?
                    .primary_modules()
                    .await?
                    .into_iter())
                })
                .try_flat_join()
                .await?,
        ))
    }

    #[turbo_tasks::function]
    async fn ignores(&self) -> Result<Vc<Glob>> {
        let is_standalone = *self.project.next_config().is_standalone().await?;
        let has_next_support = *self.project.ci_has_next_support().await?;
        let project_path = self.project.project_path().owned().await?;

        let output_file_tracing_excludes = self
            .project
            .next_config()
            .output_file_tracing_excludes(project_path)
            .await?;
        let mut additional_ignores = BTreeSet::new();

        for (route_glob, exclude_patterns) in output_file_tracing_excludes.iter() {
            // Check if the route matches the glob pattern
            if route_glob.await?.matches("next-server") {
                for (glob, root) in exclude_patterns {
                    additional_ignores.insert(if root.path.is_empty() {
                        glob.to_string()
                    } else {
                        format!("{root}/{glob}")
                    });
                }
            }
        }

        let server_ignores_glob = [
            "**/node_modules/react{,-dom,-server-dom-turbopack}/**/*.development.js",
            "**/*.d.ts",
            "**/*.map",
            "**/next/dist/pages/**/*",
            "**/next/dist/compiled/next-server/**/*.dev.js",
            "**/next/dist/compiled/webpack/*",
            "**/node_modules/webpack5/**/*",
            "**/next/dist/server/lib/route-resolver*",
            "**/next/dist/compiled/semver/semver/**/*.js",
            "**/next/dist/compiled/jest-worker/**/*",
            // -- The following were added for Turbopack specifically --
            // client/components/use-action-queue.ts has a process.env.NODE_ENV guard, but we can't set that due to React: https://github.com/vercel/next.js/pull/75254
            "**/next/dist/next-devtools/userspace/use-app-dev-rendering-indicator.js",
            // client/components/app-router.js has a process.env.NODE_ENV guard, but we
            // can't set that.
            "**/next/dist/client/dev/hot-reloader/app/hot-reloader-app.js",
            // server/lib/router-server.js doesn't guard this require:
            "**/next/dist/server/lib/router-utils/setup-dev-bundler.js",
            // server/next.js doesn't guard this require
            "**/next/dist/server/dev/next-dev-server.js",
            // next/dist/compiled/babel* pulls in this, but we never actually transpile at
            // deploy-time
            "**/next/dist/compiled/browserslist/**",
        ]
        .into_iter()
        .chain(additional_ignores.iter().map(|s| s.as_str()))
        // only ignore image-optimizer code when
        // this is being handled outside of next-server
        .chain(if has_next_support {
            Either::Left(
                [
                    "**/node_modules/sharp/**/*",
                    "**/@img/sharp-libvips*/**/*",
                    "**/next/dist/server/image-optimizer.js",
                ]
                .into_iter(),
            )
        } else {
            Either::Right(std::iter::empty())
        })
        .chain(if is_standalone {
            Either::Left(std::iter::empty())
        } else {
            Either::Right(["**/*/next/dist/server/next.js", "**/*/next/dist/bin/next"].into_iter())
        })
        .map(|g| Glob::new(g.into(), Default::default()))
        .collect::<Vec<_>>();

        Ok(match self.ty {
            ServerNftType::Full => Glob::alternatives(server_ignores_glob),
            ServerNftType::Minimal => Glob::alternatives(
                server_ignores_glob
                    .into_iter()
                    .chain(
                        [
                            "**/next/dist/compiled/edge-runtime/**/*",
                            "**/next/dist/server/web/sandbox/**/*",
                            "**/next/dist/server/post-process.js",
                        ]
                        .into_iter()
                        .map(|g| Glob::new(g.into(), Default::default())),
                    )
                    .collect(),
            ),
        })
    }
}
