use turbo_tasks::{ResolveDeep, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn ignored_indexes() {
    #[derive(ResolveDeep)]
    struct ContainsVc(Vc<i32>);

    run(&REGISTRATION, || async {
        let mut contains_vc = ContainsVc(returns_vc());
        assert!(!contains_vc.0.is_resolved());
        contains_vc.resolve_deep().await?;
        assert!(contains_vc.0.is_resolved());
        Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::function]
fn returns_vc() -> Vc<i32> {
    Vc::cell(42)
}
