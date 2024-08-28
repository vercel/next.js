use std::{
    fs::File,
    io::{BufReader, BufWriter, Write},
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
pub struct PatchPackageJson {
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

pub fn run(args: &PatchPackageJson) -> Result<()> {
    let next_peer_deps = get_next_peer_deps()?;

    let package_json_path = args.target_project_path.join("package.json");
    let package_json_file = File::open(&package_json_path)
        .with_context(|| format!("could not read {package_json_path:?}"))?;
    let mut package_value: Value = serde_json::from_reader(BufReader::new(&package_json_file))
        .with_context(|| format!("failed to parse {package_json_path:?}"))?;

    let package_map = package_value
        .as_object_mut()
        .context("package.json must represent an object")?;

    let package_deps_map = package_map
        .get_mut("dependencies")
        .and_then(Value::as_object_mut)
        .context("failed to read package.json dependencies object")?;
    insert_dependency_tarballs(package_deps_map, &[("@next/swc", &*args.next_swc_tarball)]);

    package_deps_map.insert("react".to_string(), Value::String(next_peer_deps.react));
    package_deps_map.insert(
        "react-dom".to_string(),
        Value::String(next_peer_deps.react_dom),
    );

    let pnpm_map = get_mut_or_insert_default_object(package_map, "pnpm")?;
    let pnpm_overrides_map = get_mut_or_insert_default_object(pnpm_map, "overrides")?;
    insert_dependency_tarballs(
        pnpm_overrides_map,
        &[
            ("next", &args.next_tarball),
            ("@next/mdx", &args.next_mdx_tarball),
            ("@next/env", &args.next_env_tarball),
            ("@next/bundle-analyzer", &args.next_bundle_analyzer_tarball),
        ],
    );

    let mut package_json_file = File::options()
        .write(true)
        .truncate(true)
        .open(&package_json_path)?;
    let mut writer = BufWriter::new(&mut package_json_file);
    // NOTE: serde_json defaults to two-space indents
    serde_json::to_writer_pretty(&mut writer, &package_value)?;
    writer.write_all(b"\n")?;
    writer
        .flush()
        .with_context(|| format!("failed to write {package_json_path:?}"))?;

    println!("Successfully patched `package_json_path` to use local tarball files!");
    println!("Run `pnpm i` to install the overrides");

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

fn insert_dependency_tarballs(map: &mut JsonMap, entries: &[(&str, &str)]) {
    for &(key, tarball) in entries {
        map.insert(key.to_owned(), Value::String(format!("file:{tarball}")));
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
