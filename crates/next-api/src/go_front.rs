//! Application-specific Go ingress. Native handlers are linked; other endpoints stay on Node.
use std::{collections::BTreeMap, io::Read};

use anyhow::{Context, Result, bail, ensure};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, File, FileContent, FileSystemPath, to_sys_path,
};
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{AssetContent, no_hash_salt},
    issue::IssueExt,
    output::OutputAssets,
    virtual_output::VirtualOutputAsset,
};
use turbopack_go::{GoBuildOutcome, GoOverlayFile, go_bundle_with_overlay, go_module_path};

use crate::{
    app::create_app_paths_manifest,
    go_route::{GoRouteEndpoint, GoRouteIssue, context},
    project::Project,
    route::{EndpointOutput, EndpointOutputPaths, Route},
};

fn skip_trivia(bytes: &[u8], mut at: usize) -> Result<usize> {
    loop {
        while bytes.get(at).is_some_and(u8::is_ascii_whitespace) {
            at += 1;
        }
        if bytes.get(at..at + 2) == Some(b"//".as_slice()) {
            while bytes.get(at).is_some_and(|byte| *byte != b'\n') {
                at += 1;
            }
        } else if bytes.get(at..at + 2) == Some(b"/*".as_slice()) {
            at += 2;
            while bytes.get(at..at + 2) != Some(b"*/".as_slice()) {
                ensure!(at < bytes.len(), "unterminated Go comment");
                at += 1;
            }
            at += 2;
        } else {
            return Ok(at);
        }
    }
}

// Only the package clause changes. Go still parses imports and resolves dependencies.
fn package_source(bytes: &[u8], name: &str) -> Result<Vec<u8>> {
    let at = skip_trivia(
        bytes,
        if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
            3
        } else {
            0
        },
    )?;
    ensure!(
        bytes.get(at..at + 7) == Some(b"package".as_slice()),
        "route sources must declare package main"
    );
    let start = skip_trivia(bytes, at + 7)?;
    ensure!(start > at + 7, "invalid Go package clause");
    let mut end = start;
    while bytes
        .get(end)
        .is_some_and(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
    {
        end += 1;
    }
    ensure!(
        &bytes[start..end] == b"main",
        "route sources must declare package main"
    );
    Ok([&bytes[..start], name.as_bytes(), &bytes[end..]].concat())
}

async fn overlay_package(
    root: &FileSystemPath,
    directory: FileSystemPath,
    target: String,
    package: &str,
    overlays: &mut BTreeMap<RcStr, GoOverlayFile>,
) -> Result<()> {
    let mut pending = vec![(directory, target, true)];
    while let Some((dir, target, top)) = pending.pop() {
        if let DirectoryContent::Entries(entries) = &*dir.read_dir().await? {
            for (name, entry) in entries {
                match entry {
                    DirectoryEntry::Directory(path) => {
                        pending.push((path.clone(), format!("{target}/{name}"), false))
                    }
                    DirectoryEntry::File(path) => {
                        let content = path.read().await?;
                        let FileContent::Content(file) = &*content else {
                            bail!("Go source disappeared: {}", path.path)
                        };
                        let mut original = vec![];
                        file.read().read_to_end(&mut original)?;
                        let bytes = if top && name.ends_with(".go") && !name.ends_with("_test.go") {
                            package_source(&original, package)
                                .with_context(|| format!("invalid route source: {}", path.path))?
                        } else {
                            original.clone()
                        };
                        overlays.insert(
                            format!("{target}/{name}").into(),
                            GoOverlayFile::from_source(
                                root.get_path_to(path)
                                    .context("source outside Go module")?
                                    .into(),
                                &original,
                                bytes,
                            ),
                        );
                    }
                    _ => bail!("Go server source symlinks are unsupported: {}", dir.path),
                }
            }
        }
    }
    Ok(())
}

async fn public_assets(directory: FileSystemPath) -> Result<Vec<String>> {
    let mut result = vec![];
    let mut pending = vec![(directory, String::new())];
    while let Some((dir, prefix)) = pending.pop() {
        if let DirectoryContent::Entries(entries) = &*dir.read_dir().await? {
            for (name, entry) in entries {
                let path = format!("{prefix}/{name}");
                match entry {
                    DirectoryEntry::Directory(dir) => pending.push((dir.clone(), path)),
                    DirectoryEntry::File(_) => result.push(path),
                    _ => bail!("public asset symlinks are unsupported in Go server mode"),
                }
            }
        }
    }
    result.sort();
    Ok(result)
}

#[turbo_tasks::function]
pub async fn output(project: ResolvedVc<Project>) -> Result<Vc<EndpointOutput>> {
    let session = context(*project).to_resolved().await?;
    let config = project.next_config();
    let root = project.project_path().owned().await?;
    let module = go_module_path(root.clone(), *session).await?;
    let inventory = project.entrypoints().await?;
    let mut overlays = BTreeMap::new();
    let mut imports = String::new();
    let mut registrations = String::new();
    let mut native = vec![];
    for (pathname, route) in &inventory.routes {
        let mut serve = "nil".to_owned();
        if let Route::AppRoute {
            original_name,
            endpoint,
            ..
        } = route
        {
            if let Some(endpoint) = ResolvedVc::try_downcast_type::<GoRouteEndpoint>(*endpoint) {
                let endpoint = endpoint.await?;
                let package = format!("route{}", native.len());
                // Keep the virtual import beneath the longest importable source prefix so
                // nested internal packages retain Go's visibility rules.
                let directory = endpoint.path.parent();
                let prefix = root
                    .get_path_to(&directory)
                    .context("source outside Go module")?
                    .split('/')
                    .take_while(|part| {
                        part.bytes().all(|byte| {
                            byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.')
                        })
                    })
                    .collect::<Vec<_>>()
                    .join("/");
                let target = format!("{prefix}/nextgenerated/{package}")
                    .trim_start_matches('/')
                    .to_owned();
                overlay_package(
                    &root,
                    endpoint.path.parent(),
                    target.clone(),
                    &package,
                    &mut overlays,
                )
                .await?;
                ensure!(
                    !overlays
                        .contains_key(&RcStr::from(format!("{target}/zz_next_route_params.go"))),
                    "zz_next_route_params.go is reserved for the Go handler adapter"
                );
                overlays.insert(
                    format!("{target}/zz_next_route_params.go").into(),
                    GoOverlayFile::generated(
                        include_str!("go_front_params.go")
                            .replace("PACKAGE", &package)
                            .into_bytes(),
                    ),
                );
                imports.push_str(&format!(
                    "{package} {}\n",
                    serde_json::to_string(&format!("{module}/{target}"))?
                ));
                serve = format!("{package}.NextGoServe");
                native.push((original_name.clone(), endpoint.path.clone()));
            }
        }
        registrations.push_str(&format!(
            "{{path:{},serve:{serve}}},\n",
            serde_json::to_string(pathname.as_str())?
        ));
    }
    ensure!(
        !native.is_empty(),
        "experimental.goServer requires at least one route.go handler"
    );
    let assets = public_assets(root.join("public")?)
        .await?
        .iter()
        .map(|path| Ok(format!("{}:true,", serde_json::to_string(path)?)))
        .collect::<Result<Vec<_>>>()?
        .join("\n");
    // Substitute the template in one pass; route and config strings are opaque data.
    let arguments = BTreeMap::from([
        ("/*IMPORTS*/", imports),
        ("/*ROUTES*/", registrations),
        (
            "GO_BASE_PATH",
            serde_json::to_string(config.base_path().await?.as_deref().unwrap_or(""))?,
        ),
        (
            "GO_TRAILING_SLASH",
            config.trailing_slash().await?.to_string(),
        ),
        (
            "GO_SKIP_TRAILING_SLASH",
            config.skip_trailing_slash_redirect().await?.to_string(),
        ),
        ("/*ASSETS*/", assets),
    ]);
    let substitutions = regex::Regex::new(
        r"/\*(?:IMPORTS|ROUTES|ASSETS)\*/|GO_BASE_PATH|GO_TRAILING_SLASH|GO_SKIP_TRAILING_SLASH",
    )?;
    let main = substitutions
        .replace_all(
            include_str!("go_front_main.go"),
            |capture: &regex::Captures<'_>| arguments[&capture[0]].clone(),
        )
        .into_owned();
    let entry: RcStr = root
        .get_path_to(&native[0].1.parent().join("zz_next_go_front_main.go")?)
        .context("main input outside Go module")?
        .into();
    overlays.insert(entry.clone(), GoOverlayFile::generated(main.into_bytes()));
    let build = go_bundle_with_overlay(root, vec![entry], *session, overlays).await?;
    ensure!(
        build.is_current()?,
        "Go server inputs changed during compilation"
    );
    let content = match &build.outcome {
        GoBuildOutcome::Success(content) => *content,
        GoBuildOutcome::Failed(message) => {
            GoRouteIssue::new(native[0].1.clone(), message.clone()).emit();
            return Ok(EndpointOutput {
                project,
                output_assets: OutputAssets::empty().to_resolved().await?,
                output_paths: EndpointOutputPaths::NotFound.resolved_cell(),
            }
            .cell());
        }
        _ => bail!("Go server compilation interrupted; retry the build"),
    };
    let context = session.await?;
    let hash = AssetContent::file(*content)
        .hash(no_hash_salt(), HashAlgorithm::Xxh3Hash128Hex)
        .await?;
    let executable = format!("go-server-{hash}{}", context.context.exe_suffix);
    let descriptor = serde_json::to_string(
        &serde_json::json!({"version":1,"executable":executable,"goos":context.context.goos,"goarch":context.context.goarch}),
    )?;
    let output_root = project.node_root().owned().await?;
    let disk = to_sys_path(output_root.clone())
        .await?
        .context("Go output requires disk filesystem")?;
    let mut assets = vec![];
    for (path, content) in [
        (format!("server/{executable}"), AssetContent::file(*content)),
        (
            "server/go-server.json".into(),
            AssetContent::file(FileContent::Content(File::from(descriptor.clone())).cell()),
        ),
        (
            "server/go-server.json.nft.json".into(),
            AssetContent::file(
                FileContent::Content(File::from(serde_json::to_string(
                    &serde_json::json!({"version":1,"files":[executable]}),
                )?))
                .cell(),
            ),
        ),
    ] {
        ensure!(
            !build.is_input(&disk.join(&path))?,
            "Go output would overwrite input"
        );
        assets.push(ResolvedVc::upcast(
            VirtualOutputAsset::new(output_root.join(&path)?, content)
                .to_resolved()
                .await?,
        ));
    }
    for (name, _) in native {
        ensure!(
            !build.is_input(&disk.join(format!("server/app{name}/app-paths-manifest.json")))?,
            "Go output would overwrite input"
        );
        let entry = format!("app{name}.native.json");
        let path = format!("server/{entry}");
        ensure!(
            !build.is_input(&disk.join(&path))?,
            "Go output would overwrite input"
        );
        assets.push(ResolvedVc::upcast(
            VirtualOutputAsset::new(
                output_root.join(&path)?,
                AssetContent::file(FileContent::Content(File::from(descriptor.clone())).cell()),
            )
            .to_resolved()
            .await?,
        ));
        assets.push(create_app_paths_manifest(output_root.clone(), &name, entry.into()).await?);
    }
    ensure!(
        build.is_current()?,
        "Go server inputs changed before publication"
    );
    Ok(EndpointOutput {
        project,
        output_assets: Vc::<OutputAssets>::cell(assets).to_resolved().await?,
        output_paths: EndpointOutputPaths::Native {
            executable_path: executable.into(),
            build: (*build).clone(),
        }
        .resolved_cell(),
    }
    .cell())
}

#[cfg(test)]
mod tests {
    use crate::go_front::package_source;
    #[test]
    fn preserves_comments_build_tags_and_body() {
        let source=b"//go:build linux\n/* package misleading */\npackage /* retained */ main\n// main in a comment\nvar Value = \"package main\"\n";
        let result = package_source(source, "route0").unwrap();
        assert_eq!(
            String::from_utf8(result).unwrap(),
            String::from_utf8(source.to_vec())
                .unwrap()
                .replace("*/ main", "*/ route0")
        );
        assert!(package_source(b"package other", "route0").is_err());
        assert!(package_source(b"/* missing close", "route0").is_err());
    }
}
