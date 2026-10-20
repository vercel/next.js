#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::{LazyLock, Mutex};

use anyhow::Result;
use rustc_hash::FxHashMap;
use tracing::{
    Subscriber,
    field::{Field, Visit},
    span::{Attributes, Id},
};
use tracing_subscriber::{Layer, layer::Context, prelude::*};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, OperationVc, ResolvedVc, State, Vc};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

/// Number of executions per turbo-tasks function name, collected from the
/// `turbo_tasks::function` spans emitted for every task execution.
static EXECUTIONS: LazyLock<Mutex<FxHashMap<String, usize>>> = LazyLock::new(Default::default);

struct ExecutionCounter;

impl<S: Subscriber> Layer<S> for ExecutionCounter {
    fn on_new_span(&self, attrs: &Attributes<'_>, _id: &Id, _ctx: Context<'_, S>) {
        if attrs.metadata().name() != "turbo_tasks::function" {
            return;
        }
        struct NameVisitor(Option<String>);
        impl Visit for NameVisitor {
            fn record_str(&mut self, field: &Field, value: &str) {
                if field.name() == "name" {
                    self.0 = Some(value.to_string());
                }
            }
            fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
                if field.name() == "name" {
                    self.0 = Some(format!("{value:?}").trim_matches('"').to_string());
                }
            }
        }
        let mut visitor = NameVisitor(None);
        attrs.record(&mut visitor);
        if let Some(name) = visitor.0 {
            *EXECUTIONS.lock().unwrap().entry(name).or_default() += 1;
        }
    }
}

fn take_executions() -> FxHashMap<String, usize> {
    std::mem::take(&mut *EXECUTIONS.lock().unwrap())
}

#[turbo_tasks::value(transparent)]
struct Step(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_state_operation() -> Vc<Step> {
    Step(State::new(0)).cell()
}

/// Mimics how a project rebuilds its whole env map cell whenever its options change.
#[turbo_tasks::function(operation, root)]
async fn create_env(step: ResolvedVc<Step>) -> Result<Vc<EnvMap>> {
    let step = *step.await?.get();
    let entries: &[(&str, &str)] = match step {
        1 => &[("Path", "/bin"), ("FOO", "1"), ("START_TIME", "1")],
        // only an unread key changes
        2 => &[("Path", "/bin"), ("FOO", "1"), ("START_TIME", "2")],
        // a read key changes and a previously missing key is added
        3 => &[
            ("Path", "/bin"),
            ("FOO", "2"),
            ("START_TIME", "2"),
            ("MISSING", "x"),
        ],
        // a read key is removed
        4 => &[("Path", "/bin"), ("START_TIME", "2"), ("MISSING", "x")],
        // a later case variant wins
        5 => &[
            ("Path", "/old"),
            ("PATH", "/bin"),
            ("START_TIME", "2"),
            ("MISSING", "x"),
        ],
        // a losing case variant changes without changing the normalized value
        6 => &[
            ("Path", "/other"),
            ("PATH", "/bin"),
            ("START_TIME", "2"),
            ("MISSING", "x"),
        ],
        // only the case of the source key changes
        7 => &[
            ("path", "/other"),
            ("PATH", "/bin"),
            ("START_TIME", "2"),
            ("MISSING", "x"),
        ],
        _ => &[],
    };
    Ok(Vc::cell(
        entries
            .iter()
            .map(|(k, v)| (RcStr::from(*k), RcStr::from(*v)))
            .collect::<FxIndexMap<_, _>>(),
    ))
}

#[turbo_tasks::value]
struct ReadResult {
    value: Option<RcStr>,
    random: u32,
}

#[turbo_tasks::function(operation, root)]
async fn read_env(env: OperationVc<EnvMap>, name: RcStr) -> Result<Vc<ReadResult>> {
    let value = env.connect().read(name).owned().await?;
    let random = rand::random::<u32>();
    Ok(ReadResult { value, random }.cell())
}

#[turbo_tasks::value(transparent)]
struct EnvEntries(Vec<(RcStr, RcStr)>);

#[turbo_tasks::function(operation, root)]
async fn read_all_entries(env: OperationVc<EnvMap>) -> Result<Vc<EnvEntries>> {
    Ok(Vc::cell(
        env.connect()
            .read_all()
            .await?
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    ))
}

fn entries(entries: &[(&str, &str)]) -> Vec<(RcStr, RcStr)> {
    entries
        .iter()
        .map(|(k, v)| (RcStr::from(*k), RcStr::from(*v)))
        .collect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_env_reads_are_key_granular() {
    tracing_subscriber::registry()
        .with(ExecutionCounter.with_filter(tracing_subscriber::filter::LevelFilter::TRACE))
        .init();
    run(&REGISTRATION, async || {
        let state_op = create_state_operation();
        let state_vc = state_op.resolve().strongly_consistent().await?;
        let state = state_op.read_strongly_consistent().await?;
        state.set(1);

        let env = create_env(state_vc);
        let foo = read_env(env, rcstr!("FOO"));
        // case-insensitive lookup of `Path`
        let path = read_env(env, rcstr!("PATH"));
        let missing = read_env(env, rcstr!("missing"));
        let all = read_all_entries(env);

        let foo1 = foo.read_strongly_consistent().await?;
        let path1 = path.read_strongly_consistent().await?;
        let missing1 = missing.read_strongly_consistent().await?;
        assert_eq!(foo1.value.as_deref(), Some("1"));
        assert_eq!(path1.value.as_deref(), Some("/bin"));
        assert_eq!(missing1.value, None);
        assert_eq!(
            *all.read_strongly_consistent().await?,
            entries(&[("Path", "/bin"), ("FOO", "1"), ("START_TIME", "1")])
        );

        // Changing an unrelated key must not re-execute any reader.
        take_executions();
        state.set(2);
        let foo2 = foo.read_strongly_consistent().await?;
        let path2 = path.read_strongly_consistent().await?;
        let missing2 = missing.read_strongly_consistent().await?;
        assert_eq!(foo2.value.as_deref(), Some("1"));
        assert_eq!(foo1.random, foo2.random, "FOO reader was re-executed");
        assert_eq!(path1.random, path2.random, "PATH reader was re-executed");
        assert_eq!(
            missing1.random, missing2.random,
            "MISSING reader was re-executed"
        );
        assert_eq!(
            *all.read_strongly_consistent().await?,
            entries(&[("Path", "/bin"), ("FOO", "1"), ("START_TIME", "2")])
        );
        // Only the map producer and whole-map consumers may re-execute; per-key reads
        // (`<EnvMap as ProcessEnv>::read`) must not.
        let executions = take_executions();
        let mut executed = executions.keys().map(|k| k.as_str()).collect::<Vec<_>>();
        executed.sort_unstable();
        assert_eq!(
            executed,
            [
                "<EnvMap as ProcessEnv>::read_all",
                "create_env",
                "read_all_entries",
                "uppercase_env_map",
            ],
            "unexpected re-executions: {executions:?}"
        );

        // Changing a read key and adding a missing key updates exactly those readers.
        state.set(3);
        let foo3 = foo.read_strongly_consistent().await?;
        let path3 = path.read_strongly_consistent().await?;
        let missing3 = missing.read_strongly_consistent().await?;
        assert_eq!(foo3.value.as_deref(), Some("2"));
        assert_eq!(missing3.value.as_deref(), Some("x"));
        assert_eq!(path1.random, path3.random, "PATH reader was re-executed");
        assert_eq!(
            *all.read_strongly_consistent().await?,
            entries(&[
                ("Path", "/bin"),
                ("FOO", "2"),
                ("START_TIME", "2"),
                ("MISSING", "x"),
            ])
        );

        // Removing a read key updates its reader.
        state.set(4);
        let foo4 = foo.read_strongly_consistent().await?;
        let path4 = path.read_strongly_consistent().await?;
        assert_eq!(foo4.value, None);
        assert_eq!(path1.random, path4.random, "PATH reader was re-executed");
        assert_eq!(
            *all.read_strongly_consistent().await?,
            entries(&[("Path", "/bin"), ("START_TIME", "2"), ("MISSING", "x")])
        );

        // With colliding case variants, the last one wins, as before.
        take_executions();
        state.set(5);
        let path5 = path.read_strongly_consistent().await?;
        assert_eq!(path5.value.as_deref(), Some("/bin"));
        assert_eq!(path1.random, path5.random, "PATH reader was re-executed");
        assert!(
            !take_executions().contains_key("<EnvMap as ProcessEnv>::read"),
            "PATH read was re-executed despite an unchanged normalized value"
        );
        assert_eq!(
            *all.read_strongly_consistent().await?,
            entries(&[
                ("Path", "/old"),
                ("PATH", "/bin"),
                ("START_TIME", "2"),
                ("MISSING", "x"),
            ])
        );

        // Changing only a losing case variant must not re-execute the per-key read.
        take_executions();
        state.set(6);
        let path6 = path.read_strongly_consistent().await?;
        assert_eq!(path6.value.as_deref(), Some("/bin"));
        assert_eq!(path1.random, path6.random, "PATH reader was re-executed");
        assert!(
            !take_executions().contains_key("<EnvMap as ProcessEnv>::read"),
            "PATH read was re-executed after only a losing case variant changed"
        );

        // Changing only source-key case must not re-execute the per-key read.
        take_executions();
        state.set(7);
        let path7 = path.read_strongly_consistent().await?;
        assert_eq!(path7.value.as_deref(), Some("/bin"));
        assert_eq!(path1.random, path7.random, "PATH reader was re-executed");
        assert!(
            !take_executions().contains_key("<EnvMap as ProcessEnv>::read"),
            "PATH read was re-executed after only source-key case changed"
        );
        assert_eq!(
            *all.read_strongly_consistent().await?,
            entries(&[
                ("path", "/other"),
                ("PATH", "/bin"),
                ("START_TIME", "2"),
                ("MISSING", "x"),
            ])
        );

        anyhow::Ok(())
    })
    .await
    .unwrap()
}
