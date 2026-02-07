#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{
    fmt::Debug,
    future::{Future, IntoFuture},
};

use anyhow::{Context, Result, bail};
use indoc::indoc;
use turbo_tasks::{PrettyPrintError, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

// ============================================================================
// Helper function to test error messages
// ============================================================================

async fn assert_error<T: Debug>(
    future: impl IntoFuture<Output = Result<T>>,
    expected: &'static str,
) -> Result<()> {
    let error = future.into_future().await.unwrap_err();
    assert_eq!(
        &PrettyPrintError(&error).to_string(),
        expected,
        "{:#?}",
        error
    );
    Ok(())
}

async fn test<F>(fut: impl Fn() -> F + Send + 'static)
where
    F: Future<Output = Result<()>> + Send + 'static,
{
    run(&REGISTRATION, fut).await.unwrap();
}

// ============================================================================
// Direct error functions
// ============================================================================

#[turbo_tasks::function]
fn direct_bail() -> Result<Vc<u32>> {
    bail!("direct bail error")
}

#[turbo_tasks::function]
fn direct_bail_with_context() -> Result<Vc<u32>> {
    Err(anyhow::anyhow!("direct bail error")).context("bail-context")
}

#[turbo_tasks::function]
fn direct_panic() -> Result<Vc<u32>> {
    panic!("direct panic error")
}

#[turbo_tasks::function]
fn direct_panic_with_context() -> Result<Vc<u32>> {
    // Note: panic! is synchronous, so context cannot wrap it
    panic!("direct panic error")
}

// ============================================================================
// Indirect error functions (call another function that errors)
// ============================================================================

#[turbo_tasks::function]
async fn indirect_bail() -> Result<Vc<u32>> {
    direct_bail().await?;
    Ok(Vc::cell(0))
}

#[turbo_tasks::function]
async fn indirect_bail_with_context() -> Result<Vc<u32>> {
    direct_bail().await.context("indirect-context")?;
    Ok(Vc::cell(0))
}

#[turbo_tasks::function]
async fn indirect_panic() -> Result<Vc<u32>> {
    direct_panic().await?;
    Ok(Vc::cell(0))
}

#[turbo_tasks::function]
async fn indirect_panic_with_context() -> Result<Vc<u32>> {
    direct_panic().await.context("indirect-context")?;
    Ok(Vc::cell(0))
}

// ============================================================================
// Tests
// ============================================================================

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_bail() {
    test(async || {
        assert_error(
            direct_bail(),
            indoc! {"
                direct bail error

                Debug info:
                - Execution of direct_bail failed
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_bail_with_context() {
    test(async || {
        assert_error(
            direct_bail_with_context(),
            indoc! {"
                bail-context

                Caused by:
                - direct bail error

                Debug info:
                - Execution of direct_bail_with_context failed
                - bail-context
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_panic() {
    test(async || {
        assert_error(
            direct_panic(),
            indoc! {"
                direct panic error

                Debug info:
                - Execution of direct_panic failed
                - direct panic error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_panic_with_context() {
    // Note: panic! is synchronous, so .context() cannot wrap it
    test(async || {
        assert_error(
            direct_panic_with_context(),
            indoc! {"
                direct panic error

                Debug info:
                - Execution of direct_panic_with_context failed
                - direct panic error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_bail() {
    test(async || {
        assert_error(
            indirect_bail(),
            indoc! {"
                direct bail error

                Debug info:
                - Execution of indirect_bail failed
                - Execution of direct_bail failed
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_bail_with_context() {
    test(async || {
        assert_error(
            indirect_bail_with_context(),
            indoc! {"
                indirect-context

                Caused by:
                - direct bail error

                Debug info:
                - Execution of indirect_bail_with_context failed
                - indirect-context
                - Execution of direct_bail failed
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_panic() {
    test(async || {
        assert_error(
            indirect_panic(),
            indoc! {"
                direct panic error

                Debug info:
                - Execution of indirect_panic failed
                - Execution of direct_panic failed
                - direct panic error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_panic_with_context() {
    test(async || {
        assert_error(
            indirect_panic_with_context(),
            indoc! {"
                indirect-context

                Caused by:
                - direct panic error

                Debug info:
                - Execution of indirect_panic_with_context failed
                - indirect-context
                - Execution of direct_panic failed
                - direct panic error"},
        )
        .await
    })
    .await;
}

// ============================================================================
// In-context wrapper functions (not turbo_tasks functions)
// ============================================================================

async fn direct_bail_in_context() -> Result<()> {
    direct_bail().await.context("in-context")?;
    Ok(())
}

async fn direct_bail_with_context_in_context() -> Result<()> {
    direct_bail_with_context().await.context("in-context")?;
    Ok(())
}

async fn direct_panic_in_context() -> Result<()> {
    direct_panic().await.context("in-context")?;
    Ok(())
}

async fn direct_panic_with_context_in_context() -> Result<()> {
    direct_panic_with_context().await.context("in-context")?;
    Ok(())
}

async fn indirect_bail_in_context() -> Result<()> {
    indirect_bail().await.context("in-context")?;
    Ok(())
}

async fn indirect_bail_with_context_in_context() -> Result<()> {
    indirect_bail_with_context().await.context("in-context")?;
    Ok(())
}

async fn indirect_panic_in_context() -> Result<()> {
    indirect_panic().await.context("in-context")?;
    Ok(())
}

async fn indirect_panic_with_context_in_context() -> Result<()> {
    indirect_panic_with_context().await.context("in-context")?;
    Ok(())
}

// ============================================================================
// In-context tests
// ============================================================================

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_bail_in_context() {
    test(async || {
        assert_error(
            direct_bail_in_context(),
            indoc! {"
                in-context

                Caused by:
                - direct bail error

                Debug info:
                - in-context
                - Execution of direct_bail failed
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_bail_with_context_in_context() {
    test(async || {
        assert_error(
            direct_bail_with_context_in_context(),
            indoc! {"
                in-context

                Caused by:
                - bail-context
                - direct bail error

                Debug info:
                - in-context
                - Execution of direct_bail_with_context failed
                - bail-context
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_panic_in_context() {
    test(async || {
        assert_error(
            direct_panic_in_context(),
            indoc! {"
                in-context

                Caused by:
                - direct panic error

                Debug info:
                - in-context
                - Execution of direct_panic failed
                - direct panic error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_direct_panic_with_context_in_context() {
    test(async || {
        assert_error(
            direct_panic_with_context_in_context(),
            indoc! {"
                in-context

                Caused by:
                - direct panic error

                Debug info:
                - in-context
                - Execution of direct_panic_with_context failed
                - direct panic error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_bail_in_context() {
    test(async || {
        assert_error(
            indirect_bail_in_context(),
            indoc! {"
                in-context

                Caused by:
                - direct bail error

                Debug info:
                - in-context
                - Execution of indirect_bail failed
                - Execution of direct_bail failed
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_bail_with_context_in_context() {
    test(async || {
        assert_error(
            indirect_bail_with_context_in_context(),
            indoc! {"
                in-context

                Caused by:
                - indirect-context
                - direct bail error

                Debug info:
                - in-context
                - Execution of indirect_bail_with_context failed
                - indirect-context
                - Execution of direct_bail failed
                - direct bail error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_panic_in_context() {
    test(async || {
        assert_error(
            indirect_panic_in_context(),
            indoc! {"
                in-context

                Caused by:
                - direct panic error

                Debug info:
                - in-context
                - Execution of indirect_panic failed
                - Execution of direct_panic failed
                - direct panic error"},
        )
        .await
    })
    .await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_indirect_panic_with_context_in_context() {
    test(async || {
        assert_error(
            indirect_panic_with_context_in_context(),
            indoc! {"
                in-context

                Caused by:
                - indirect-context
                - direct panic error

                Debug info:
                - in-context
                - Execution of indirect_panic_with_context failed
                - indirect-context
                - Execution of direct_panic failed
                - direct panic error"},
        )
        .await
    })
    .await;
}
