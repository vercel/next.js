use proc_macro::TokenStream;
use quote::quote;
use syn::{ItemFn, parse_macro_input};

/// Dual-mode test attribute. Lets a single async test body run under both the async
/// (tokio) build and the synchronous (`sync`, no-tokio) build.
///
/// - **async build** (`tokio_runtime`): expands to `#[tokio::test(<args>)]` on the original async
///   fn, unchanged. Args pass through verbatim, so call sites keep writing
///   `#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]`.
/// - **sync build** (`sync`): strips `async`, wraps the body in `sync_poll_test(async move { ..
///   })`, and emits a plain `#[test]`. The whole body (including the harness `run!`/`run_once!`
///   glue and every `.await`) is driven to completion by a single synchronous poll — valid because
///   under the sync engine every awaited future is immediately `Ready` (reads compute inline).
///
/// The decision is made via `cfg!(feature = "sync")` *in this proc-macro crate*:
/// `turbo-tasks` forwards its `sync` feature to `turbo-tasks-macros/sync`, so the
/// macro crate is compiled with `sync` exactly when the consuming build is.
pub fn test(args: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemFn);

    if cfg!(feature = "sync") {
        let ItemFn {
            attrs,
            vis,
            mut sig,
            block,
        } = item;
        // The test runs synchronously; drop `async` from the signature.
        sig.asyncness = None;
        let stmts = &block.stmts;
        quote! {
            #[test]
            #(#attrs)*
            #vis #sig {
                ::turbo_tasks::macro_helpers::sync_poll_test(async move {
                    #(#stmts)*
                })
            }
        }
        .into()
    } else {
        let args: proc_macro2::TokenStream = args.into();
        quote! {
            #[::tokio::test(#args)]
            #item
        }
        .into()
    }
}
