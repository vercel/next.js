#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)]

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: u32,
}

// NOT marked with `root` — this is the key
#[turbo_tasks::function(operation)]
async fn non_root_operation() -> Result<Vc<Value>> {
    Ok(Value { value: 42 }.cell())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_strongly_consistent_read_of_non_root_task_panics() {
    // The panic happens on a worker thread. Capture the message via a panic hook.
    let panic_message = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));
    let panic_message_clone = panic_message.clone();

    let prev_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else {
            format!("{info}")
        };
        if msg.contains("root") {
            *panic_message_clone.lock().unwrap() = Some(msg);
        }
    }));

    // Spawn to catch the unwinding panic from the channel close on the test task.
    let handle = tokio::task::spawn(async move {
        run_once_without_cache_check(&REGISTRATION, async move {
            non_root_operation().read_strongly_consistent().await
        })
        .await
    });
    // The spawned task will fail because the worker thread panics and the channel closes.
    let _result = handle.await;

    std::panic::set_hook(prev_hook);

    let msg = panic_message.lock().unwrap().take();
    assert!(
        msg.is_some(),
        "Expected a panic about missing `root` attribute on the worker thread"
    );
    let msg = msg.unwrap();
    assert!(
        msg.contains("root"),
        "Panic message should mention 'root', got: {msg}"
    );
}
