//! Cross-directory dual-mode Cargo scaffolder for the Next.js Rust crates.
//!
//! Same job as `sync-cargo-scaffold` (scaffold.rs) but for crates whose mode-ful
//! dependencies live in a DIFFERENT directory tree. The Next crates in `crates/`
//! depend on turbopack crates in `turbopack/crates/`, so the dep rewrite must emit
//! the correct cross-dir relative path (e.g. `../../turbopack/crates/turbopack-core`)
//! instead of the sibling `../<name>` that scaffold.rs assumes.
//!
//! For each mode-ful crate in the TARGET dir that lacks a `sync` feature it:
//!   * `default = ["tokio_runtime", <preserved existing default entries>]`
//!   * `tokio_runtime = ["<dep>/tokio_runtime", ...]` for each mode-ful dep
//!   * `sync = ["<dep>/sync", ...]` for each mode-ful dep
//!   * rewrites each mode-ful turbo*/turbopack* dep to a direct path dep with `default-features =
//!     false` (cargo forbids overriding default-features on a workspace-inherited dep, so a
//!     `--features sync` build stays tokio-free)
//!
//! Mode-ful set is computed by fixpoint over the UNION of all search dirs, so
//! turbopack crates (not in the target dir) are correctly recognized as mode-ful.
//! Idempotent: crates that already declare a `sync` feature are skipped.
//!
//! Usage: scaffold-next <target-dir> <search-dir>...
//!   e.g. scaffold-next crates crates turbopack/crates

use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};

use toml_edit::{Array, DocumentMut, Item, Value};

struct Crate {
    name: String,
    manifest: PathBuf,
    dir: PathBuf,
    /// Library-linked deps (normal + build) — these determine whether the crate is
    /// mode-ful. Dev-deps are intentionally excluded: a mode-ful dev-dep only affects
    /// the crate's own test build, not what downstream consumers link.
    lib_deps: BTreeSet<String>,
    has_sync_feature: bool,
    default_entries: Vec<String>,
    in_target: bool,
}

fn dep_names(tbl: Option<&Item>, out: &mut BTreeSet<String>) {
    if let Some(Item::Table(t)) = tbl {
        for (k, _) in t.iter() {
            out.insert(k.to_string());
        }
    }
}

fn load_crates(root: &Path, target: &Path, out: &mut Vec<Crate>, seen: &mut BTreeSet<String>) {
    let Ok(rd) = std::fs::read_dir(root) else {
        return;
    };
    for entry in rd.flatten() {
        let dir = entry.path();
        let manifest = dir.join("Cargo.toml");
        if !manifest.is_file() {
            continue;
        }
        let text = std::fs::read_to_string(&manifest).unwrap();
        let doc: DocumentMut = match text.parse() {
            Ok(d) => d,
            Err(_) => continue,
        };
        let name = doc
            .get("package")
            .and_then(|p| p.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() || !seen.insert(name.clone()) {
            continue;
        }
        let mut lib_deps = BTreeSet::new();
        dep_names(doc.get("dependencies"), &mut lib_deps);
        dep_names(doc.get("build-dependencies"), &mut lib_deps);
        let feats = doc.get("features").and_then(|f| f.as_table());
        let has_sync_feature = feats.map(|t| t.contains_key("sync")).unwrap_or(false);
        let default_entries = feats
            .and_then(|t| t.get("default"))
            .and_then(|d| d.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        let in_target = dir.parent() == Some(target);
        out.push(Crate {
            name,
            manifest,
            dir,
            lib_deps,
            has_sync_feature,
            default_entries,
            in_target,
        });
    }
}

/// Fixpoint: a crate is mode-ful if it depends on turbo-tasks or on a mode-ful crate.
fn compute_mode_ful(crates: &[Crate]) -> BTreeSet<String> {
    let names: BTreeSet<&str> = crates.iter().map(|c| c.name.as_str()).collect();
    let mut mode_ful: BTreeSet<String> = BTreeSet::new();
    mode_ful.insert("turbo-tasks".to_string());
    loop {
        let mut changed = false;
        for c in crates {
            if mode_ful.contains(&c.name) {
                continue;
            }
            if c.lib_deps.iter().any(|d| mode_ful.contains(d)) {
                mode_ful.insert(c.name.clone());
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    mode_ful.retain(|m| m == "turbo-tasks" || names.contains(m.as_str()));
    mode_ful
}

/// Relative path from `from` dir to `to` dir, both absolute/canonicalized.
fn relative_path(from: &Path, to: &Path) -> String {
    let from: Vec<_> = from.components().collect();
    let to: Vec<_> = to.components().collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<String> = Vec::new();
    for _ in common..from.len() {
        parts.push("..".to_string());
    }
    for c in &to[common..] {
        parts.push(c.as_os_str().to_string_lossy().into_owned());
    }
    parts.join("/")
}

fn str_array(items: impl Iterator<Item = String>) -> Array {
    let mut a = Array::new();
    for s in items {
        a.push(s);
    }
    a
}

fn scaffold_crate(
    c: &Crate,
    mode_ful: &BTreeSet<String>,
    dirs: &BTreeMap<String, PathBuf>,
) -> Result<bool, String> {
    if c.has_sync_feature || c.name == "turbo-tasks" || !c.in_target {
        return Ok(false);
    }
    let text = std::fs::read_to_string(&c.manifest).map_err(|e| e.to_string())?;
    let mut doc: DocumentMut = text.parse().map_err(|e| format!("{}: {e}", c.name))?;

    let mut touched: BTreeSet<String> = BTreeSet::new();
    for table in ["dependencies", "dev-dependencies", "build-dependencies"] {
        let Some(Item::Table(t)) = doc.get_mut(table) else {
            continue;
        };
        let names: Vec<String> = t.iter().map(|(k, _)| k.to_string()).collect();
        for name in names {
            if !mode_ful.contains(&name) {
                continue;
            }
            let Some(dep_dir) = dirs.get(&name) else {
                continue;
            };
            touched.insert(name.clone());
            let entry = t.get_mut(&name).unwrap();
            let mut preserved: BTreeMap<String, Value> = BTreeMap::new();
            if let Item::Value(Value::InlineTable(it)) = entry {
                for (k, v) in it.iter() {
                    if k != "workspace" && k != "path" && k != "default-features" && k != "version"
                    {
                        preserved.insert(k.to_string(), v.clone());
                    }
                }
            }
            let rel = relative_path(&c.dir, dep_dir);
            let mut new_it = toml_edit::InlineTable::new();
            new_it.insert("path", Value::from(rel));
            new_it.insert("default-features", Value::from(false));
            for (k, v) in preserved {
                new_it.insert(&k, v);
            }
            *entry = Item::Value(Value::InlineTable(new_it));
        }
    }

    if touched.is_empty() {
        return Ok(false);
    }

    if doc.get("features").and_then(|f| f.as_table()).is_none() {
        doc["features"] = toml_edit::table();
    }
    let feats = doc["features"].as_table_mut().unwrap();

    // Preserve existing default entries (e.g. process_pool) + ensure tokio_runtime.
    let mut default_items = c.default_entries.clone();
    if !default_items.iter().any(|s| s == "tokio_runtime") {
        default_items.insert(0, "tokio_runtime".to_string());
    }
    feats["default"] = toml_edit::value(str_array(default_items.into_iter()));
    feats["tokio_runtime"] = toml_edit::value(str_array(
        touched.iter().map(|d| format!("{d}/tokio_runtime")),
    ));
    feats["sync"] = toml_edit::value(str_array(touched.iter().map(|d| format!("{d}/sync"))));

    std::fs::write(&c.manifest, doc.to_string()).map_err(|e| e.to_string())?;
    Ok(true)
}

fn main() {
    let mut args = std::env::args().skip(1);
    let target = args.next().unwrap_or_else(|| {
        eprintln!("usage: scaffold-next <target-dir> <search-dir>...");
        std::process::exit(2);
    });
    let search_dirs: Vec<String> = args.collect();
    if search_dirs.is_empty() {
        eprintln!("usage: scaffold-next <target-dir> <search-dir>...");
        std::process::exit(2);
    }
    let target = std::fs::canonicalize(&target).expect("canonicalize target");

    let mut crates = Vec::new();
    let mut seen = BTreeSet::new();
    for d in &search_dirs {
        let d = std::fs::canonicalize(d).expect("canonicalize search dir");
        load_crates(&d, &target, &mut crates, &mut seen);
    }
    let mode_ful = compute_mode_ful(&crates);
    let dirs: BTreeMap<String, PathBuf> = crates
        .iter()
        .map(|c| (c.name.clone(), c.dir.clone()))
        .collect();
    // Optional allowlist: SCAFFOLD_ONLY=next-core,next-api,next-build restricts which
    // target-dir crates get scaffolded (leave the async-only entry crates untouched).
    let only: Option<BTreeSet<String>> = std::env::var("SCAFFOLD_ONLY")
        .ok()
        .map(|s| s.split(',').map(|x| x.trim().to_string()).collect());
    println!(
        "mode-ful crates: {} (target dir has {})",
        mode_ful.len(),
        crates.iter().filter(|c| c.in_target).count()
    );

    let mut scaffolded = Vec::new();
    let mut skipped = 0usize;
    for c in &crates {
        if !mode_ful.contains(&c.name) || !c.in_target {
            continue;
        }
        if let Some(only) = &only {
            if !only.contains(&c.name) {
                continue;
            }
        }
        match scaffold_crate(c, &mode_ful, &dirs) {
            Ok(true) => scaffolded.push(c.name.clone()),
            Ok(false) => skipped += 1,
            Err(e) => {
                eprintln!("ERROR {e}");
                std::process::exit(1);
            }
        }
    }
    println!(
        "scaffolded {} crates ({skipped} skipped):",
        scaffolded.len()
    );
    for n in &scaffolded {
        println!("  + {n}");
    }
}
