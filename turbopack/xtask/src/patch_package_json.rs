use std::{
    fs::File,
    io::{self, BufReader, BufWriter, Write},
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use clap::Parser;
use serde::Deserialize;
use serde_json::Value;

type JsonMap = serde_json::Map<String, Value>;

/// Modifies a target project's package.json to point to the next.js tarballs previously built from
/// this next.js repository with `pnpm pack-next`.
#[derive(Parser)]
#[command(name = "patch-package-json")]
pub struct PatchPackageJsonArgs {
    target_project_path: PathBuf,

    #[arg(long, value_name = "FILE")]
    next_tarball: String,

    #[arg(long, value_name = "FILE")]
    next_mdx_tarball: String,
    #[arg(long, value_name = "FILE")]
    next_env_tarball: String,
    #[arg(long, value_name = "FILE")]
    next_bundle_analyzer_tarball: String,
    #[arg(long, value_name = "FILE")]
    next_swc_tarball: String,
}

/// A subset of the `packages/next/package.json` file, used to determine what `peerDependencies` we
/// require for `react`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NextPackageJson {
    peer_dependencies: NextPeerDeps,
}

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
struct NextPeerDeps {
    react: String,
    react_dom: String,
}

pub fn run(args: &PatchPackageJsonArgs) -> Result<()> {
    let package_json_path = find_workspace_root(&args.target_project_path)?
        .map(|root| root.join("package.json"))
        .inspect(|json_path| println!("Found workspace! Patching {json_path:?} with overrides."))
        // if we're not in a workspace, apply the changes we would've made to the workspace root to
        // the project's package.json file
        .unwrap_or_else(|| args.target_project_path.join("package.json"));

    let mut package_json_value = read_json_value(&package_json_path)?;
    let package_json_map = to_package_json_map(&mut package_json_value)?;
    patch_workspace_package_json_map(args, package_json_map)?;
    write_json_value(&package_json_path, &package_json_value)?;

    println!("Successfully patched {package_json_path:?} to use local tarball files!");
    // TODO: Bun is currently broken for unknown reasons, it generates ENOTDIR when trying to read
    // the tarballs
    // NOTE: Yarn is currently broken due to an upstream issue:
    // https://github.com/yarnpkg/yarn/issues/6339
    println!("Run `pnpm i` or `npm i` to install the overrides");

    Ok(())
}

fn read_json_value(path: &Path) -> Result<Value> {
    serde_json::from_reader(BufReader::new(
        File::open(path).with_context(|| format!("could not read {path:?}"))?,
    ))
    .with_context(|| format!("failed to parse {path:?}"))
}

fn write_json_value(path: &Path, value: &Value) -> Result<()> {
    (|| {
        let file = File::options().write(true).truncate(true).open(path)?;
        let mut writer = BufWriter::new(file);

        // NOTE: serde_json defaults to two-space indents
        serde_json::to_writer_pretty(&mut writer, value)?;
        writer.write_all(b"\n")?;
        writer.flush()?;
        anyhow::Ok(())
    })()
    .with_context(|| format!("failed to write {path:?}"))
}

fn to_package_json_map(value: &mut Value) -> Result<&mut JsonMap> {
    value
        .as_object_mut()
        .context("package.json must represent an object")
}

fn patch_workspace_package_json_map(
    args: &PatchPackageJsonArgs,
    package_json_map: &mut JsonMap,
) -> Result<()> {
    let next_peer_deps = get_next_peer_deps()?;

    // insert overrides
    let overrides = [
        ("next", &*format!("file:{}", args.next_tarball)),
        ("@next/mdx", &*format!("file:{}", args.next_mdx_tarball)),
        ("@next/env", &*format!("file:{}", args.next_env_tarball)),
        (
            "@next/bundle-analyzer",
            &*format!("file:{}", args.next_bundle_analyzer_tarball),
        ),
        // next-swc is added to the project's package.json, but also set a global override just in
        // case something else pulls it in
        ("@next/swc", &*format!("file:{}", args.next_swc_tarball)),
        // next's peerDependencies
        ("react", &*next_peer_deps.react),
        ("react-dom", &*next_peer_deps.react_dom),
    ];

    // npm uses `overrides`: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides
    // bun also supports this: https://bun.sh/docs/install/overrides
    let overrides_map = get_mut_or_insert_default_object(package_json_map, "overrides")?;
    insert_map_entries(overrides_map, &overrides[..]);

    // yarn uses `resolutions`: https://yarnpkg.com/configuration/manifest#resolutions
    // pnpm also supports this: https://pnpm.io/package_json#resolutions
    let resolutions_map = get_mut_or_insert_default_object(package_json_map, "resolutions")?;
    insert_map_entries(resolutions_map, &overrides[..]);

    // add `@next/swc` to `dependencies`, without this next might fall back to downloading the
    // binary blob from the release version, which isn't what we want.
    let deps_map = get_mut_or_insert_default_object(package_json_map, "dependencies")?;
    insert_map_entries(
        deps_map,
        &[("@next/swc", &*format!("file:{}", args.next_swc_tarball))],
    );

    // npm requires that any direct dependencies in the workspace file match the version specified
    // in the overrides:
    //
    // > You may not set an override for a package that you directly depend on unless both the
    // > dependency and the override itself share the exact same spec.
    update_map_entries_if_exists(deps_map, &overrides[..]);

    Ok(())
}

fn get_next_peer_deps() -> Result<NextPeerDeps> {
    let package_json_path = Path::new(file!())
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .and_then(Path::parent)
        .with_context(|| format!("{} does not have enough ancestors?", file!()))?
        .join("packages")
        .join("next")
        .join("package.json");
    Ok(
        serde_json::from_reader::<_, NextPackageJson>(BufReader::new(File::open(
            package_json_path,
        )?))?
        .peer_dependencies,
    )
}

fn insert_map_entries(map: &mut JsonMap, entries: &[(&str, &str)]) {
    for &(key, value) in entries {
        map.insert(key.to_owned(), Value::String(value.to_owned()));
    }
}

fn update_map_entries_if_exists(map: &mut JsonMap, entries: &[(&str, &str)]) {
    for &(key, value) in entries {
        if let Some(old_value) = map.get_mut(key) {
            *old_value = Value::String(value.to_owned());
        }
    }
}

fn get_mut_or_insert_default_object<'a>(
    map: &'a mut JsonMap,
    key: &str,
) -> Result<&'a mut JsonMap> {
    map.entry(key)
        .or_insert_with(|| Value::Object(Default::default()))
        .as_object_mut()
        .with_context(|| format!("failed to read package.json object with key {key}"))
}

/// pnpm and npm (and probably bun+yarn too) require that overrides are set in the root package.json
/// of the workspace.
///
/// Different package managers have slightly different logic. We'll return the first workspace root
/// we find that's valid for any package manager.
///
/// Returns `None` if we're not in a workspace.
///
/// Here's how pnpm does it:
/// <https://github.com/pnpm/pnpm/blob/757e6be29d1916fd0c/workspace/find-workspace-dir/src/index.ts>
fn find_workspace_root(project_path: &Path) -> Result<Option<PathBuf>> {
    const ENV_VAR: &str = "NPM_CONFIG_WORKSPACE_DIR";
    for ev in [ENV_VAR, &ENV_VAR.to_ascii_lowercase()] {
        if let Some(root) = std::env::var_os(ev) {
            return Ok(Some(root.into()));
        }
    }

    for ancestor in project_path.canonicalize()?.ancestors() {
        if ancestor.join("pnpm-workspace.yaml").exists() {
            return Ok(Some(ancestor.to_owned()));
        }
        let package_json_path = ancestor.join("package.json");
        let package_json_file = match File::open(&package_json_path) {
            Ok(file) => file,
            Err(err) if err.kind() == io::ErrorKind::NotFound => continue,
            Err(err) => return Err(err.into()),
        };
        let package_json_value: Value = serde_json::from_reader(BufReader::new(package_json_file))?;
        if package_json_value
            .as_object()
            .with_context(|| format!("failed to parse {package_json_path:?}"))?
            .contains_key("workspaces")
        {
            return Ok(Some(ancestor.to_owned()));
        }
    }
    // we didn't find a workspace root, we're not in a workspace
    Ok(None)
}
