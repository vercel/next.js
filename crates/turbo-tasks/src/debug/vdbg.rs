// NOTE(alexkirsz) Implementation and comments are based on the `dbg!` macro
// from the Rust standard library.
/// This macro supports the same syntax as `dbg!`, but also supports
/// pretty-printing `Vc` types.
///
/// Beware: this macro should only be used for debugging purposes. Its behavior
/// around dependency tracking is not well-defined and could lead to unexpected
/// results.
#[macro_export]
macro_rules! vdbg {
    // NOTE: We cannot use `concat!` to make a static string as a format argument
    // of `eprintln!` because `file!` could contain a `{` or
    // `$val` expression could be a block (`{ .. }`), in which case the `eprintln!`
    // will be malformed.
    () => {
        eprintln!("[{}:{}]", file!(), line!())
    };
    ($val:expr ; depth = $depth:expr) => {
        // Use of `match` here is intentional because it affects the lifetimes
        // of temporaries - https://stackoverflow.com/a/48732525/1063961
        match $val {
            tmp => {
                $crate::macro_helpers::spawn_detached(async move {
                    use $crate::debug::ValueDebugFormat;
                    eprintln!(
                        "[{}:{}] {} = {}",
                        file!(),
                        line!(),
                        stringify!($val),
                        (&tmp).value_debug_format($depth).try_to_string().await?,
                    );
                    Ok(())
                });
                tmp
            }
        }
    };
    ($($val:expr),+ ; depth = $depth:expr) => {
        ($(vdbg!($val ; depth = $depth)),+,)
    };
    ($val:expr $(,)?) => {
        vdbg!($val ; depth = usize::MAX)
    };
    ($($val:expr),+ $(,)?) => {
        ($(vdbg!($val)),+,)
    };
}
