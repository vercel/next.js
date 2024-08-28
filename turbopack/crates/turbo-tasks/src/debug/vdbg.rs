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

    (__init $depth:expr ; [ $val:expr $(, $rest:expr)* ] [ $($tt:tt)* ] ) => {
        {
            let valstr = stringify!($val);
            // We move the value into a new binding so we may refer to it multiple
            // times without re-evaluating the expression.
            let valmove = $val;
            // We convert the value to an owned value which will be moved into the
            // spawned thread. This is necessary in order to ensure a 'static lifetime
            // for the value, but it may require a clone.
            let valowned = valmove.to_owned();
            $crate::vdbg!(__init $depth ; [ $($rest),* ] [ $($tt)* valstr valmove valowned ])
        }
    };
    (__init $depth:expr ; [ ] [ $($valstr:ident $valmove:ident $valowned:ident)* ] ) => {
        {
            use $crate::debug::ValueDebugFormat;
            let depth = $depth;
            $crate::macro_helpers::spawn_detached_for_testing(async move {
                $crate::vdbg!(__expand depth ; [ $($valstr $valowned)* ] []);
                Ok(())
            });
            ($($valmove),*)
        }
    };

    (__expand $depth:ident ; [ $valstr:ident $val:ident $($rest:tt)* ] [ $($tt:tt)* ]) => {
        let valdbg = (&$val).value_debug_format($depth).try_to_string().await?;
        $crate::vdbg!(__expand $depth ; [ $($rest)* ] [ $($tt)* $valstr valdbg ]);
    };
    (__expand $depth:ident ; [] [ $( $valstr:ident $valdbg:ident )* ]) => {
        // By pre-awaiting, then printing everything at once, we ensure that the
        // output won't be interleaved with output from other threads, and that
        // it will always appear in the order that the macro was invoked.
        eprint!(
            $crate::vdbg!(__repeat "[{file}:{line}] {} = {}\n" $($valstr)*),
            $(
                $valstr,
                $valdbg,
            )*
            file = file!(),
            line = line!(),
        );
    };

    // Sub-macro for repeating a string N times, where N is controlled by the number of identifiers
    // passed to the macro.
    (__repeat $str:literal $x:ident $($rest:ident)*) => { concat!($str, $crate::vdbg!(__repeat $str $($rest)*)) };
    (__repeat $str:literal) => { "" };

    ($($val:expr),* ; depth = $depth:expr) => {
        $crate::vdbg!(__init $depth ; [ $($val),* ] [])
    };
    ($($val:expr),+ $(,)?) => {
        $crate::vdbg!(__init usize::MAX ; [ $($val),* ] [])
    };
}
