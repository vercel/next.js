#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use turbo_tasks::debug::ValueDebugFormat;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn ignored_indexes() {
    #[allow(dead_code)]
    #[derive(ValueDebugFormat)]
    struct IgnoredIndexes(
        #[allow(dead_code)]
        #[turbo_tasks(debug_ignore)]
        i32,
        i32,
        #[allow(dead_code)]
        #[turbo_tasks(debug_ignore)]
        i32,
    );

    run(&REGISTRATION, || async {
        let input = IgnoredIndexes(-1, 2, -3);
        let debug = input.value_debug_format(usize::MAX).try_to_string().await?;
        assert!(!debug.contains("-1"));
        assert!(debug.contains('2'));
        assert!(!debug.contains("-3"));
        anyhow::Ok(())
    })
    .await
    .unwrap();
}
