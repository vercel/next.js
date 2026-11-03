//! Checks that the server actions transform only reads a lazy hash salt for modules whose output
//! depends on it (Turbopack uses this to avoid depending on the encryption key for all other
//! modules), and that a lazy salt behaves exactly like an eager one.

use std::{
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};

use next_custom_transforms::transforms::server_actions::{
    self, HashSalt, ServerActionsMode, server_actions,
};
use rustc_hash::FxHashSet;
use swc_core::{
    common::{
        FileName, GLOBALS, Globals, Mark, SourceMap,
        comments::SingleThreadedComments,
        errors::{DiagnosticBuilder, Emitter, HANDLER, Handler},
        sync::Lrc,
    },
    ecma::{
        ast::Program,
        codegen::{self, text_writer::JsWriter},
        parser::{EsSyntax, Syntax, TsSyntax, parse_file_as_module},
        transforms::base::resolver,
    },
};
use turbo_rcstr::rcstr;

#[derive(Clone, Default)]
struct CollectingEmitter(Arc<Mutex<Vec<String>>>);

impl Emitter for CollectingEmitter {
    fn emit(&mut self, db: &mut DiagnosticBuilder<'_>) {
        let span = db.span.primary_span();
        self.0
            .lock()
            .unwrap()
            .push(format!("{:?} {:?}: {}", db.level, span, db.message()));
    }
}

fn syntax_for(path: &Path) -> Syntax {
    match path.extension().and_then(|e| e.to_str()) {
        Some("ts") => Syntax::Typescript(Default::default()),
        Some("tsx") => Syntax::Typescript(TsSyntax {
            tsx: true,
            ..Default::default()
        }),
        _ => Syntax::Es(EsSyntax {
            jsx: true,
            ..Default::default()
        }),
    }
}

/// Transforms `source` and returns the printed output (with comments) and the diagnostics.
fn transform(
    source: &str,
    syntax: Syntax,
    is_react_server_layer: bool,
    hash_salt: HashSalt,
) -> (String, Vec<String>) {
    GLOBALS.set(&Globals::new(), || {
        let cm: Lrc<SourceMap> = Default::default();
        let file_name = FileName::Real("/app/item.js".into());
        let fm = cm.new_source_file(file_name.clone().into(), source.to_string());
        let comments = SingleThreadedComments::default();
        // Parse as a module, like the fixture tests do.
        let mut program = Program::Module(
            parse_file_as_module(
                &fm,
                syntax,
                Default::default(),
                Some(&comments),
                &mut vec![],
            )
            .unwrap(),
        );

        let emitter = CollectingEmitter::default();
        let diagnostics = emitter.0.clone();
        let handler = Handler::with_emitter(true, false, Box::new(emitter));
        HANDLER.set(&handler, || {
            let unresolved_mark = Mark::new();
            program.mutate(resolver(unresolved_mark, Mark::new(), false));
            program.mutate(server_actions(
                &file_name,
                None,
                server_actions::Config {
                    is_react_server_layer,
                    is_development: false,
                    use_cache_enabled: true,
                    hash_salt,
                    cache_kinds: FxHashSet::from_iter([rcstr!("x")]),
                },
                comments.clone(),
                unresolved_mark,
                cm.clone(),
                Default::default(),
                ServerActionsMode::Turbopack,
            ));
        });

        let mut buf = vec![];
        codegen::Emitter {
            cfg: Default::default(),
            cm: cm.clone(),
            comments: Some(&comments),
            wr: JsWriter::new(cm.clone(), "\n", &mut buf, None),
        }
        .emit_program(&program)
        .unwrap();
        let diagnostics = diagnostics.lock().unwrap().clone();
        (String::from_utf8(buf).unwrap(), diagnostics)
    })
}

/// Checks the lazy salt for one input. Returns whether the salt was read.
fn check(name: &str, source: &str, syntax: Syntax, is_react_server_layer: bool) -> bool {
    let eager = transform(source, syntax, is_react_server_layer, "salt".into());
    let other_salt = transform(source, syntax, is_react_server_layer, "other".into());

    let reads = Arc::new(AtomicUsize::new(0));
    let lazy = transform(source, syntax, is_react_server_layer, {
        let reads = reads.clone();
        HashSalt::lazy(move || {
            reads.fetch_add(1, Ordering::Relaxed);
            rcstr!("salt")
        })
    });

    assert_eq!(
        lazy, eager,
        "{name}: a lazy salt must behave like an eager one"
    );
    let read = reads.load(Ordering::Relaxed) > 0;
    if read {
        // The transform may generate IDs and then discard the output because of errors.
        assert!(
            other_salt.0 != eager.0 || !eager.1.is_empty(),
            "{name}: the salt was read, but the output doesn't depend on it"
        );
    } else {
        assert_eq!(
            other_salt, eager,
            "{name}: the output depends on the salt, but it wasn't read"
        );
    }
    read
}

fn collect_inputs(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect_inputs(&path, out);
        } else if path
            .file_stem()
            .is_some_and(|stem| stem.to_str() == Some("input"))
        {
            out.push(path);
        }
    }
}

#[test]
fn lazy_salt_is_only_read_when_needed() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut inputs = vec![];
    collect_inputs(&root.join("tests/fixture/server-actions"), &mut inputs);
    collect_inputs(&root.join("tests/errors/server-actions"), &mut inputs);
    inputs.sort();

    let (mut read, mut not_read) = (0, 0);
    for input in &inputs {
        let source = std::fs::read_to_string(input).unwrap();
        for is_react_server_layer in [true, false] {
            let name = format!(
                "{} (server layer: {is_react_server_layer})",
                input.strip_prefix(root).unwrap().display()
            );
            if check(&name, &source, syntax_for(input), is_react_server_layer) {
                read += 1;
            } else {
                not_read += 1;
            }
        }
    }

    assert!(read > 0, "no input read the salt");
    assert!(not_read > 0, "every input read the salt");
}

#[test]
fn lazy_salt_is_not_read_without_server_functions() {
    let syntax = Syntax::Es(Default::default());
    assert!(!check(
        "no directive",
        "export const a = 'use client'; export default function f() { return 'use server'; }",
        syntax,
        true,
    ));
    assert!(check(
        "use server",
        "export async function f() { 'use server'; }",
        syntax,
        true,
    ));
}

/// The JS side (webpack) must always pass a salt.
#[test]
fn deserialized_config_requires_hash_salt() {
    let config = |hash_salt: &str| {
        format!(
            r#"{{"isReactServerLayer":true,"isDevelopment":false,"useCacheEnabled":true,{hash_salt}"cacheKinds":[]}}"#
        )
    };
    let parse = |json: String| serde_json::from_str::<server_actions::Config>(&json);
    let source = "export async function f() { 'use server'; }";
    let syntax = Syntax::Es(Default::default());
    let parsed = parse(config(r#""hashSalt":"salt","#)).unwrap();
    assert_eq!(
        transform(source, syntax, true, parsed.hash_salt),
        transform(source, syntax, true, "salt".into()),
    );
    assert!(parse(config("")).is_err());
    assert!(parse(config(r#""hashSalt":null,"#)).is_err());
}
