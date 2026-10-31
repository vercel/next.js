//! Checks that running the server actions transform without a hash salt first (and retrying with
//! the salt only when it is needed, as Turbopack does) behaves exactly like a single run with the
//! salt: same output, same comments, same diagnostics, same telemetry.

use std::{
    cell::RefCell,
    path::{Path, PathBuf},
    rc::Rc,
    sync::{Arc, Mutex},
};

use next_custom_transforms::transforms::server_actions::{self, ServerActionsMode, server_actions};
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    common::{
        BytePos, FileName, GLOBALS, Globals, Mark, SourceMap,
        comments::{Comment, SingleThreadedComments},
        errors::{DiagnosticBuilder, Emitter, HANDLER, Handler},
        sync::Lrc,
    },
    ecma::{
        ast::Program,
        codegen::{self, text_writer::JsWriter},
        parser::{EsSyntax, Syntax, TsSyntax, parse_file_as_program},
        transforms::base::resolver,
    },
};

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

type Telemetry = Rc<RefCell<FxHashMap<String, usize>>>;

struct Run {
    code: String,
    comments: CommentsSnapshot,
    diagnostics: Vec<String>,
    telemetry: Vec<(String, usize)>,
}

struct Case<'a> {
    name: &'a str,
    source: &'a str,
    syntax: Syntax,
    is_react_server_layer: bool,
    is_development: bool,
    use_cache_enabled: bool,
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

fn config(case: &Case, hash_salt: Option<&str>) -> server_actions::Config {
    server_actions::Config {
        is_react_server_layer: case.is_react_server_layer,
        is_development: case.is_development,
        use_cache_enabled: case.use_cache_enabled,
        hash_salt: hash_salt.map(Into::into),
        cache_kinds: FxHashSet::from_iter(["x".into()]),
    }
}

/// The leading and trailing comments, sorted by position.
type CommentsSnapshot = [Vec<(BytePos, Vec<Comment>)>; 2];

fn snapshot_comments(comments: &SingleThreadedComments) -> CommentsSnapshot {
    let (leading, trailing) = comments.borrow_all();
    [&*leading, &*trailing].map(|map| {
        let mut entries: Vec<_> = map
            .iter()
            .filter(|(_, comments)| !comments.is_empty())
            .map(|(pos, comments)| (*pos, comments.clone()))
            .collect();
        entries.sort_by_key(|(pos, _)| *pos);
        entries
    })
}

/// Prints the program with its comments. Codegen consumes the comments it prints, so this prints a
/// copy of them.
fn print(cm: &Lrc<SourceMap>, program: &Program, comments: &SingleThreadedComments) -> String {
    let comments = {
        let (leading, trailing) = comments.borrow_all();
        SingleThreadedComments::from_leading_and_trailing(
            Rc::new(RefCell::new(leading.clone())),
            Rc::new(RefCell::new(trailing.clone())),
        )
    };
    let mut buf = vec![];
    {
        let mut emitter = codegen::Emitter {
            cfg: Default::default(),
            cm: cm.clone(),
            comments: Some(&comments),
            wr: JsWriter::new(cm.clone(), "\n", &mut buf, None),
        };
        emitter.emit_program(program).unwrap();
    }
    String::from_utf8(buf).unwrap()
}

/// Runs `f` on a freshly parsed and resolved program, collecting diagnostics and telemetry.
fn run(
    case: &Case,
    f: impl FnOnce(
        &mut Program,
        &FileName,
        SingleThreadedComments,
        Mark,
        Lrc<SourceMap>,
        Telemetry,
        &dyn Fn() -> Vec<String>,
    ),
) -> Run {
    GLOBALS.set(&Globals::new(), || {
        let cm: Lrc<SourceMap> = Default::default();
        let file_name = FileName::Real("/app/item.js".into());
        let fm = cm.new_source_file(file_name.clone().into(), case.source.to_string());
        let comments = SingleThreadedComments::default();
        let mut program = parse_file_as_program(
            &fm,
            case.syntax,
            Default::default(),
            Some(&comments),
            &mut vec![],
        )
        .unwrap_or_else(|e| panic!("{}: failed to parse: {e:?}", case.name));

        let emitter = CollectingEmitter::default();
        let diagnostics = emitter.0.clone();
        let handler = Handler::with_emitter(true, false, Box::new(emitter));
        let telemetry: Telemetry = Default::default();

        HANDLER.set(&handler, || {
            let unresolved_mark = Mark::new();
            program.mutate(resolver(unresolved_mark, Mark::new(), false));
            f(
                &mut program,
                &file_name,
                comments.clone(),
                unresolved_mark,
                cm.clone(),
                telemetry.clone(),
                &|| diagnostics.lock().unwrap().clone(),
            );
        });

        let mut telemetry: Vec<_> = telemetry.borrow().clone().into_iter().collect();
        telemetry.sort();
        let diagnostics = diagnostics.lock().unwrap().clone();
        Run {
            code: print(&cm, &program, &comments),
            comments: snapshot_comments(&comments),
            diagnostics,
            telemetry,
        }
    })
}

/// Asserts that the salt-less run followed by an optional salted retry matches a single salted
/// run. Returns whether the salt was needed.
fn check_parity(case: &Case) -> bool {
    let salted = run(
        case,
        |program, file_name, comments, mark, cm, telemetry, _| {
            program.mutate(server_actions(
                file_name,
                None,
                config(case, Some("salt")),
                comments,
                mark,
                cm,
                telemetry,
                ServerActionsMode::Turbopack,
            ));
        },
    );

    let mut needed = false;
    let retried = run(
        case,
        |program, file_name, comments, mark, cm, telemetry, diagnostics| {
            let code_before = print(&cm, program, &comments);
            let comments_before = snapshot_comments(&comments);
            let mut pass = server_actions(
                file_name,
                None,
                config(case, None),
                comments.clone(),
                mark,
                cm.clone(),
                telemetry.clone(),
                ServerActionsMode::Turbopack,
            );
            program.mutate(&mut pass);
            needed = pass.hash_salt_needed();
            if needed {
                assert_eq!(
                    print(&cm, program, &comments),
                    code_before,
                    "{}: the salt-less run must not modify the program when the salt is needed",
                    case.name
                );
                assert_eq!(
                    snapshot_comments(&comments),
                    comments_before,
                    "{}: the salt-less run must not modify comments when the salt is needed",
                    case.name
                );
                assert_eq!(
                    diagnostics(),
                    Vec::<String>::new(),
                    "{}: the salt-less run must not report diagnostics when the salt is needed",
                    case.name
                );
                assert!(
                    telemetry.borrow().is_empty(),
                    "{}: the salt-less run must not count telemetry when the salt is needed",
                    case.name
                );
                program.mutate(server_actions(
                    file_name,
                    None,
                    config(case, Some("salt")),
                    comments,
                    mark,
                    cm,
                    telemetry,
                    ServerActionsMode::Turbopack,
                ));
            }
        },
    );

    assert_eq!(retried.code, salted.code, "{}: output differs", case.name);
    assert_eq!(
        retried.comments, salted.comments,
        "{}: comments differ",
        case.name
    );
    assert_eq!(
        retried.diagnostics, salted.diagnostics,
        "{}: diagnostics differ",
        case.name
    );
    assert_eq!(
        retried.telemetry, salted.telemetry,
        "{}: telemetry differs",
        case.name
    );
    needed
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
fn fixtures_match_single_salted_run() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut inputs = vec![];
    collect_inputs(&root.join("tests/fixture/server-actions"), &mut inputs);
    collect_inputs(&root.join("tests/errors/server-actions"), &mut inputs);
    inputs.sort();
    assert!(!inputs.is_empty());

    let (mut needed, mut not_needed) = (0, 0);
    for input in &inputs {
        let source = std::fs::read_to_string(input).unwrap();
        // Match the development mode the fixture and error tests use for these inputs.
        let is_development = input.starts_with(root.join("tests/errors"))
            || input.iter().any(|s| s.to_str() == Some("development"));
        for (is_react_server_layer, use_cache_enabled) in config_variants() {
            let name = format!(
                "{} (server layer: {is_react_server_layer}, development: {is_development}, use \
                 cache: {use_cache_enabled})",
                input.strip_prefix(root).unwrap().display(),
            );
            let case = Case {
                name: &name,
                source: &source,
                syntax: syntax_for(input),
                is_react_server_layer,
                is_development,
                use_cache_enabled,
            };
            if check_parity(&case) {
                needed += 1;
            } else {
                not_needed += 1;
            }
        }
    }

    assert!(needed > 0, "no fixture needed the hash salt");
    assert!(not_needed > 0, "every fixture needed the hash salt");
}

/// `(is_react_server_layer, use_cache_enabled)`
fn config_variants() -> impl Iterator<Item = (bool, bool)> {
    [true, false].into_iter().flat_map(|is_react_server_layer| {
        [true, false]
            .into_iter()
            .map(move |use_cache_enabled| (is_react_server_layer, use_cache_enabled))
    })
}

fn check_case(source: &str, is_react_server_layer: bool, expect_needed: bool) {
    for is_development in [true, false] {
        for use_cache_enabled in [true, false] {
            let case = Case {
                name: source,
                source,
                syntax: Syntax::Es(EsSyntax {
                    jsx: true,
                    ..Default::default()
                }),
                is_react_server_layer,
                is_development,
                use_cache_enabled,
            };
            assert_eq!(
                check_parity(&case),
                expect_needed,
                "{source}: unexpected hash_salt_needed"
            );
        }
    }
}

#[test]
fn no_directive() {
    check_case(
        "export const a = 1; export function f() { return 'use client'; }",
        true,
        false,
    );
}

#[test]
fn error_before_later_inline_directive() {
    check_case(
        "export async function a() { 'use sevrer'; } export function b() { async function c() { \
         'use server'; } return c; }",
        true,
        true,
    );
}

#[test]
fn nested_inline_directive() {
    check_case(
        "export function Page() { async function outer() { 'use cache'; async function inner() { \
         'use server'; } return inner; } return outer; }",
        true,
        true,
    );
}

#[test]
fn unknown_cache_kind() {
    check_case(
        "'use cache: unknown'; export async function a() {}",
        true,
        true,
    );
}

#[test]
fn misspelled_use_cache_kind() {
    check_case(
        "export async function a() { 'use cache:x'; return 1; }",
        true,
        true,
    );
}

#[test]
fn inline_use_server_in_client_component() {
    check_case(
        "export function Page() { async function action() { 'use server'; } return action; }",
        false,
        false,
    );
}

#[test]
fn non_ascii_string() {
    // Byte 9 (`"use cache".len()`) and byte 10 (`"use server".len()`) fall inside `Ñ` in these
    // strings.
    check_case(
        "export const a = 'ÄÅÇÉÑÖÜáàâäãåçéèêë'; export const b = 'aÄÅÇÉÑÖÜáàâ';",
        true,
        false,
    );
    check_case(
        "export const a = 'ÄÅÇÉÑÖÜáàâäãåçéèêë'; export async function f() { 'use server'; }",
        true,
        true,
    );
}

#[test]
fn lone_surrogate_string() {
    check_case("export const s = '\\uD800abcdefghijkl';", true, false);
    check_case(
        "export const s = '\\uD800abcdefghijkl'; export async function f() { 'use server'; }",
        true,
        true,
    );
}

/// The JS side (webpack) must always pass a salt; it must never silently get the salt-less run.
#[test]
fn deserialized_config_requires_hash_salt() {
    let config = |hash_salt: &str| {
        format!(
            r#"{{"isReactServerLayer":true,"isDevelopment":false,"useCacheEnabled":true,{hash_salt}"cacheKinds":[]}}"#
        )
    };
    let parsed: server_actions::Config =
        serde_json::from_str(&config(r#""hashSalt":"salt","#)).unwrap();
    assert_eq!(parsed.hash_salt.as_deref(), Some("salt"));
    assert!(serde_json::from_str::<server_actions::Config>(&config("")).is_err());
    assert!(
        serde_json::from_str::<server_actions::Config>(&config(r#""hashSalt":null,"#)).is_err()
    );
}
