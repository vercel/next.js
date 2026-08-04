//! Cargo dual-mode scaffolder for the sync turbo-tasks migration.
//!
//! Every crate that (transitively) depends on `turbo-tasks` must select exactly
//! one mode — `tokio_runtime` (async, default) or `sync` (no-tokio) — because
//! turbo-tasks doesn't compile with neither. This tool applies, format-preservingly,
//! the same Cargo scaffolding we did by hand for fs/env/core to every such crate:
//!
//!   * `default = ["tokio_runtime"]` (merged with any existing default entries)
//!   * `tokio_runtime = ["<dep>/tokio_runtime", ...]` for each MODE-FUL dep
//!   * `sync = ["<dep>/sync", ...]` for each mode-ful dep
//!   * each mode-ful turbo*/turbopack* dep rewritten to a direct path dep with `default-features =
//!     false` (so a `--features sync` build stays tokio-free; cargo forbids overriding
//!     default-features on workspace-inherited deps)
//!
//! It does NOT touch a crate's own `tokio` dep or its `.await` bodies — those are
//! the per-crate Phase-B (tokio-leaf cfg splits) and Phase-C (codemod) steps.
//!
//! "Mode-ful" = depends on turbo-tasks, or on another mode-ful crate (fixpoint).
//! Pure-util leaves (turbo-tasks-hash, turbo-rcstr, turbo-tasks-malloc, …) never
//! become mode-ful and are left as workspace deps.
//!
//! Usage: sync-cargo-scaffold <crates-dir>   (e.g. turbopack/crates)
//! Idempotent: crates that already declare a `sync` feature are skipped.

use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};

use toml_edit::{Array, DocumentMut, Item, Value};

struct Crate {
    name: String,
    manifest: PathBuf,
    deps: BTreeSet<String>, // all internal dep names (normal + dev + build)
    has_sync_feature: bool,
}

fn dep_names(tbl: Option<&Item>, out: &mut BTreeSet<String>) {
    if let Some(Item::Table(t)) = tbl {
        for (k, _) in t.iter() {
            out.insert(k.to_string());
        }
    }
}

fn load_crates(root: &Path) -> Vec<Crate> {
    let mut crates = Vec::new();
    for entry in std::fs::read_dir(root).expect("read crates dir").flatten() {
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
        if name.is_empty() {
            continue;
        }
        let mut deps = BTreeSet::new();
        dep_names(doc.get("dependencies"), &mut deps);
        dep_names(doc.get("dev-dependencies"), &mut deps);
        dep_names(doc.get("build-dependencies"), &mut deps);
        let has_sync_feature = doc
            .get("features")
            .and_then(|f| f.as_table())
            .map(|t| t.contains_key("sync"))
            .unwrap_or(false);
        crates.push(Crate {
            name,
            manifest,
            deps,
            has_sync_feature,
        });
    }
    crates
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
            if c.deps.iter().any(|d| mode_ful.contains(d)) {
                mode_ful.insert(c.name.clone());
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    // Only crates that actually exist in this dir are rewritable.
    mode_ful.retain(|m| m == "turbo-tasks" || names.contains(m.as_str()));
    mode_ful
}

/// Rewrite the deps in one table, collecting mode-ful internal dep names touched.
fn rewrite_dep_table(
    item: Option<&mut Item>,
    mode_ful: &BTreeSet<String>,
    touched: &mut BTreeSet<String>,
) {
    let Some(Item::Table(t)) = item else { return };
    let dep_names: Vec<String> = t.iter().map(|(k, _)| k.to_string()).collect();
    for name in dep_names {
        if !mode_ful.contains(&name) {
            continue;
        }
        touched.insert(name.clone());
        let entry = t.get_mut(&name).unwrap();
        // Normalize to an inline table: { path = "../<name>", default-features = false, <preserved>
        // }
        let mut preserved: BTreeMap<String, Value> = BTreeMap::new();
        match entry {
            Item::Value(Value::InlineTable(it)) => {
                for (k, v) in it.iter() {
                    if k != "workspace" && k != "path" && k != "default-features" && k != "version"
                    {
                        preserved.insert(k.to_string(), v.clone());
                    }
                }
            }
            _ => {} // plain version string or other; just replace
        }
        let mut new_it = toml_edit::InlineTable::new();
        new_it.insert("path", Value::from(format!("../{name}")));
        new_it.insert("default-features", Value::from(false));
        for (k, v) in preserved {
            new_it.insert(&k, v);
        }
        *entry = Item::Value(Value::InlineTable(new_it));
    }
}

fn str_array(items: impl Iterator<Item = String>) -> Array {
    let mut a = Array::new();
    for s in items {
        a.push(s);
    }
    a
}

fn scaffold_crate(c: &Crate, mode_ful: &BTreeSet<String>) -> Result<bool, String> {
    if c.has_sync_feature || c.name == "turbo-tasks" {
        return Ok(false); // already converted / the root itself
    }
    let text = std::fs::read_to_string(&c.manifest).map_err(|e| e.to_string())?;
    let mut doc: DocumentMut = text.parse().map_err(|e| format!("{}: {e}", c.name))?;

    let mut touched: BTreeSet<String> = BTreeSet::new();
    rewrite_dep_table(doc.get_mut("dependencies"), mode_ful, &mut touched);
    rewrite_dep_table(doc.get_mut("dev-dependencies"), mode_ful, &mut touched);
    rewrite_dep_table(doc.get_mut("build-dependencies"), mode_ful, &mut touched);

    if touched.is_empty() {
        return Ok(false);
    }

    // Ensure [features] table exists.
    if doc.get("features").and_then(|f| f.as_table()).is_none() {
        doc["features"] = toml_edit::table();
    }
    let feats = doc["features"].as_table_mut().unwrap();

    // default must contain "tokio_runtime" (merge with existing entries).
    let mut default_items: Vec<String> = feats
        .get("default")
        .and_then(|d| d.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    if !default_items.iter().any(|s| s == "tokio_runtime") {
        default_items.push("tokio_runtime".to_string());
    }
    feats["default"] = toml_edit::value(str_array(default_items.into_iter()));

    // tokio_runtime / sync forward to each mode-ful dep touched.
    feats["tokio_runtime"] = toml_edit::value(str_array(
        touched.iter().map(|d| format!("{d}/tokio_runtime")),
    ));
    feats["sync"] = toml_edit::value(str_array(touched.iter().map(|d| format!("{d}/sync"))));

    std::fs::write(&c.manifest, doc.to_string()).map_err(|e| e.to_string())?;
    Ok(true)
}

fn main() {
    let root = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("usage: sync-cargo-scaffold <crates-dir>");
        std::process::exit(2);
    });
    let root = PathBuf::from(root);
    let crates = load_crates(&root);
    let mode_ful = compute_mode_ful(&crates);
    println!("mode-ful crates: {}", mode_ful.len());

    let mut scaffolded = Vec::new();
    let mut skipped = 0usize;
    for c in &crates {
        if !mode_ful.contains(&c.name) {
            continue;
        }
        match scaffold_crate(c, &mode_ful) {
            Ok(true) => scaffolded.push(c.name.clone()),
            Ok(false) => skipped += 1,
            Err(e) => {
                eprintln!("ERROR {e}");
                std::process::exit(1);
            }
        }
    }
    println!(
        "scaffolded {} crates ({skipped} already-done/skipped):",
        scaffolded.len()
    );
    for n in &scaffolded {
        println!("  + {n}");
    }
}
