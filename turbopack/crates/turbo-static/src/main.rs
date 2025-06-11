use std::{
    error::Error,
    fs,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use call_resolver::CallResolver;
use clap::Parser;
use identifier::{Identifier, IdentifierReference};
use itertools::Itertools;
use rustc_hash::{FxHashMap, FxHashSet};
use syn::visit::Visit;
use visitor::CallingStyleVisitor;

use crate::visitor::CallingStyle;

mod call_resolver;
mod identifier;
mod lsp_client;
mod visitor;

#[derive(Parser)]
struct Opt {
    #[clap(required = true)]
    paths: Vec<PathBuf>,

    /// reparse all files
    #[clap(long)]
    reparse: bool,

    /// reindex all files
    #[clap(long)]
    reindex: bool,
}

fn main() -> Result<(), Box<dyn Error>> {
    tracing_subscriber::fmt::init();
    let opt = Opt::parse();

    let mut connection = lsp_client::RAClient::new();
    connection.start(&opt.paths);

    let call_resolver = CallResolver::new(&mut connection, Some("call_resolver.bincode".into()));
    let mut call_resolver = if opt.reindex {
        call_resolver.cleared()
    } else {
        call_resolver
    };

    let halt = Arc::new(AtomicBool::new(false));
    let halt_clone = halt.clone();
    ctrlc::set_handler({
        move || {
            halt_clone.store(true, Ordering::SeqCst);
        }
    })?;

    tracing::info!("getting tasks");
    let mut tasks = get_all_tasks(&opt.paths);
    let dep_tree = resolve_tasks(&mut tasks, &mut call_resolver, halt.clone());
    let concurrency = resolve_concurrency(&tasks, &dep_tree, halt.clone());

    write_dep_tree(&tasks, concurrency, std::path::Path::new("graph.cypherl"));

    if halt.load(Ordering::Relaxed) {
        tracing::info!("ctrl-c detected, exiting");
    }

    Ok(())
}

/// search the given folders recursively and attempt to find all tasks inside
#[tracing::instrument(skip_all)]
fn get_all_tasks(folders: &[PathBuf]) -> FxHashMap<Identifier, Vec<String>> {
    let mut out = FxHashMap::default();

    for folder in folders {
        let walker = ignore::Walk::new(folder);
        for entry in walker {
            let entry = entry.unwrap();
            let rs_file = if let Some(true) = entry.file_type().map(|t| t.is_file()) {
                let path = entry.path();
                let ext = path.extension().unwrap_or_default();
                if ext == "rs" {
                    std::fs::canonicalize(path).unwrap()
                } else {
                    continue;
                }
            } else {
                continue;
            };

            let file = fs::read_to_string(&rs_file).unwrap();
            let lines = file.lines();
            let mut occurrences = vec![];

            tracing::debug!("processing {}", rs_file.display());

            for ((_, line), (line_no, _)) in lines.enumerate().tuple_windows() {
                if line.contains("turbo_tasks::function") {
                    tracing::debug!("found at {:?}:L{}", rs_file, line_no);
                    occurrences.push(line_no + 1);
                }
            }

            if occurrences.is_empty() {
                continue;
            }

            // parse the file using syn and get the span of the functions
            let file = syn::parse_file(&file).unwrap();
            let occurrences_count = occurrences.len();
            let mut visitor = visitor::TaskVisitor::new();
            syn::visit::visit_file(&mut visitor, &file);
            if visitor.results.len() != occurrences_count {
                tracing::warn!(
                    "file {:?} passed the heuristic with {:?} but the visitor found {:?}",
                    rs_file,
                    occurrences_count,
                    visitor.results.len()
                );
            }

            out.extend(
                visitor
                    .results
                    .into_iter()
                    .map(move |(ident, tags)| ((rs_file.clone(), ident).into(), tags)),
            )
        }
    }

    out
}

/// Given a list of tasks, get all the tasks that call that one
fn resolve_tasks(
    tasks: &mut FxHashMap<Identifier, Vec<String>>,
    client: &mut CallResolver,
    halt: Arc<AtomicBool>,
) -> FxHashMap<Identifier, Vec<IdentifierReference>> {
    tracing::info!(
        "found {} tasks, of which {} cached",
        tasks.len(),
        client.cached_count()
    );

    let mut unresolved = tasks.keys().cloned().collect::<FxHashSet<_>>();
    let mut resolved = FxHashMap::default();

    while let Some(top) = unresolved.iter().next().cloned() {
        unresolved.remove(&top);

        let callers = client.resolve(&top);

        // add all non-task callers to the unresolved list if they are not in the
        // resolved list
        for caller in callers.iter() {
            if !resolved.contains_key(&caller.identifier)
                && !unresolved.contains(&caller.identifier)
            {
                tracing::debug!("adding {} to unresolved", caller.identifier);
                unresolved.insert(caller.identifier.to_owned());
            }
        }
        resolved.insert(top.to_owned(), callers);

        if halt.load(Ordering::Relaxed) {
            break;
        }
    }

    resolved
}

/// given a map of tasks and functions that call it, produce a map of tasks and
/// those tasks that it calls
///
/// returns a list of pairs with a task, the task that calls it, and the calling
/// style
fn resolve_concurrency(
    task_list: &FxHashMap<Identifier, Vec<String>>,
    dep_tree: &FxHashMap<Identifier, Vec<IdentifierReference>>, // pairs of tasks and call trees
    halt: Arc<AtomicBool>,
) -> Vec<(Identifier, Identifier, CallingStyle)> {
    // println!("{:?}", dep_tree);
    // println!("{:#?}", task_list);

    let mut edges = vec![];

    for (ident, references) in dep_tree {
        for reference in references {
            #[allow(clippy::map_entry)] // This doesn't insert into dep_tree, so entry isn't useful
            if !dep_tree.contains_key(&reference.identifier) {
                // this is a task that is not in the task list
                // so we can't resolve it
                tracing::error!("missing task for {}: {}", ident, reference.identifier);
                for task in task_list.keys() {
                    if task.name == reference.identifier.name {
                        // we found a task that is not in the task list
                        // so we can't resolve it
                        tracing::trace!("- found {}", task);
                        continue;
                    }
                }
                continue;
            } else {
                // load the source file and get the calling style
                let target = IdentifierReference {
                    identifier: ident.clone(),
                    references: reference.references.clone(),
                };
                let mut visitor = CallingStyleVisitor::new(target);
                tracing::info!("looking for {} from {}", ident, reference.identifier);
                let file =
                    syn::parse_file(&fs::read_to_string(&reference.identifier.path).unwrap())
                        .unwrap();
                visitor.visit_file(&file);

                edges.push((
                    ident.clone(),
                    reference.identifier.clone(),
                    visitor.result().unwrap_or(CallingStyle::Once),
                ));
            }

            if halt.load(Ordering::Relaxed) {
                break;
            }
        }
    }

    // parse each fn between parent and child and get the max calling style

    edges
}

/// Write the dep tree into the given file using cypher syntax
fn write_dep_tree(
    task_list: &FxHashMap<Identifier, Vec<String>>,
    dep_tree: Vec<(Identifier, Identifier, CallingStyle)>,
    out: &std::path::Path,
) {
    use std::io::Write;

    let mut node_ids = FxHashMap::default();
    let mut counter = 0;

    let mut file = std::fs::File::create(out).unwrap();

    let empty = vec![];

    // collect all tasks as well as all intermediate nodes
    // tasks come last to ensure the tags are preserved
    let node_list = dep_tree
        .iter()
        .flat_map(|(dest, src, _)| [(src, &empty), (dest, &empty)])
        .chain(task_list)
        .collect::<FxHashMap<_, _>>();

    for (ident, tags) in node_list {
        counter += 1;

        let label = if !task_list.contains_key(ident) {
            "Function"
        } else if tags.contains(&"fs".to_string()) || tags.contains(&"network".to_string()) {
            "ImpureTask"
        } else {
            "Task"
        };

        _ = writeln!(
            file,
            "CREATE (n_{}:{} {{name: '{}', file: '{}', line: {}, tags: [{}]}})",
            counter,
            label,
            ident.name,
            ident.path,
            ident.range.start.line,
            tags.iter().map(|t| format!("\"{t}\"")).join(",")
        );
        node_ids.insert(ident, counter);
    }

    for (dest, src, style) in &dep_tree {
        let style = match style {
            CallingStyle::Once => "ONCE",
            CallingStyle::ZeroOrOnce => "ZERO_OR_ONCE",
            CallingStyle::ZeroOrMore => "ZERO_OR_MORE",
            CallingStyle::OneOrMore => "ONE_OR_MORE",
        };

        let src_id = *node_ids.get(src).unwrap();
        let dst_id = *node_ids.get(dest).unwrap();

        _ = writeln!(file, "CREATE (n_{src_id})-[:{style}]->(n_{dst_id})",);
    }
}
