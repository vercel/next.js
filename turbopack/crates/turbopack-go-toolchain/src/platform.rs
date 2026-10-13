//! Host requirements belong to embedded-tool preparation, not to the consumer binary.
use anyhow::Result;
use tokio_util::sync::CancellationToken;

pub(crate) async fn check_host(go_version: String, cancellation: CancellationToken) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use anyhow::{Context, ensure};
        let mut command = tokio::process::Command::new("/usr/bin/sw_vers");
        // Older macOS releases can otherwise report a compatibility version of 10.16.
        command
            .env("SYSTEM_VERSION_COMPAT", "0")
            .arg("-productVersion");
        let report = crate::process::output(command, &cancellation)
            .await
            .context("detecting macOS version for embedded Go")?;
        ensure!(
            report.status.success(),
            "unable to detect macOS version for embedded Go: {}",
            String::from_utf8_lossy(&report.stderr)
        );
        let version = std::str::from_utf8(&report.stdout)
            .context("macOS reported a non-UTF8 version")?
            .trim();
        validate_macos_version(&go_version, version)?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (go_version, cancellation);
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn validate_macos_version(go_version: &str, version: &str) -> Result<()> {
    use anyhow::{Context, ensure};
    let components = version
        .split('.')
        .map(str::parse::<u32>)
        .collect::<std::result::Result<Vec<_>, _>>()
        .with_context(|| format!("unable to parse detected macOS version {version:?}"))?;
    let major = components.first().copied().unwrap_or_default();
    let go_version = go_version.strip_prefix("go").unwrap_or(go_version);
    ensure!(
        major >= 13,
        "embedded Go {go_version} requires macOS 13+; detected macOS {version}. Use a compatible \
         external Go toolchain with --go <path>."
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_macos_version;

    #[test]
    fn supported_macos_versions() {
        for version in ["13.0", "13.7.6", "14.0", "26.0.1"] {
            validate_macos_version("go1.27.2", version).unwrap();
        }
    }

    #[test]
    fn unsupported_macos_versions_report_detected_version() {
        for version in ["11.7.10", "12.7.6"] {
            let message = validate_macos_version("go1.27.2", version)
                .unwrap_err()
                .to_string();
            assert!(message.contains("embedded Go 1.27.2 requires macOS 13+"));
            assert!(message.contains(&format!("detected macOS {version}")));
            assert!(message.contains("--go"));
        }
    }

    #[test]
    fn unknown_macos_versions_fail_closed() {
        for version in ["", "unknown", "13.invalid", "-1.0"] {
            let message = validate_macos_version("go1.27.2", version)
                .unwrap_err()
                .to_string();
            assert!(message.contains("unable to parse detected macOS version"));
            assert!(message.contains(version));
        }
    }
}
