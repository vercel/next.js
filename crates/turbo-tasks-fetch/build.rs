use turbo_tasks_build::generate_register;

#[cfg(any(feature = "native-tls", feature = "rustls-tls"))]
fn check_tls_config() {
    // do nothing
}
#[cfg(not(any(feature = "native-tls", feature = "rustls-tls")))]
fn check_tls_config() {
    panic!("You must enable one of the TLS features: native-tls or rustls-tls");
}

fn main() {
    generate_register();

    // Check if tls feature for reqwest is properly configured.
    // Technically reqwest falls back to non-tls http request if none of the tls
    // features are enabled, But we won't allow it.
    check_tls_config();
}
