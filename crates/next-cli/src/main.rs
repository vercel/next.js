//! Next.js CLI Wrapper
//!
//! A fast native binary that handles the restart loop for `next dev`.
//! Exit code 77 signals "restart needed" (e.g., after config changes).
//!
//! ## Production Only
//!
//! This binary is designed for production use when installed via npm.
//! It expects to be located at `node_modules/@next/cli-*/bin/next` with
//! the Next.js script at `node_modules/next/dist/bin/next`.
//!
//! For in-repo development, the shell scripts (`bin/next`) fall back to
//! Node.js directly. This keeps the Rust code simple and focused.
//!
//! ## Node Flags
//!
//! Flags like `--inspect` must be passed to Node.js before the script.
//! This binary detects these flags and reorders them automatically.

use std::{
    env,
    path::PathBuf,
    process::{exit, Command},
};

/// Exit code used by Next.js to signal restart needed
const RESTART_EXIT_CODE: i32 = 77;

/// Parsed command-line arguments
struct ParsedArgs {
    /// Flags that must be passed to Node.js (e.g., --inspect)
    node_flags: Vec<String>,
    /// Arguments for the Next.js script
    script_args: Vec<String>,
    /// Whether to enable source maps
    enable_source_maps: bool,
}

/// Parse arguments, separating Node.js flags from script arguments
fn parse_args(args: &[String]) -> ParsedArgs {
    let mut node_flags = Vec::new();
    let mut script_args = Vec::new();
    let mut enable_source_maps = true;

    for arg in args.iter().skip(1) {
        if arg.starts_with("--inspect") {
            node_flags.push(arg.clone());
        } else {
            if arg == "--disable-source-maps" {
                enable_source_maps = false;
            }
            script_args.push(arg.clone());
        }
    }

    ParsedArgs {
        node_flags,
        script_args,
        enable_source_maps,
    }
}

/// Get the path to the Next.js script
fn get_script_path() -> PathBuf {
    // Production path: binary at @next/cli-*/bin/next
    // Script at node_modules/next/dist/bin/next (sibling package)
    env::current_exe()
        .expect("failed to get executable path")
        .canonicalize()
        .expect("failed to canonicalize path")
        .parent()
        .expect("failed to get bin dir")
        .parent()
        .expect("failed to get package dir")
        .parent()
        .expect("failed to get node_modules dir")
        .join("next/dist/bin/next")
}

/// Check if user has already set memory limit in NODE_OPTIONS
fn user_set_memory_limit() -> bool {
    env::var("NODE_OPTIONS")
        .map(|opts| opts.contains("max-old-space-size") || opts.contains("max_old_space_size"))
        .unwrap_or(false)
}

/// Get total system memory in MB
fn get_system_memory_mb() -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        parse_linux_meminfo(&std::fs::read_to_string("/proc/meminfo").ok()?)
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .ok()?;
        let bytes: u64 = String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse()
            .ok()?;
        Some(bytes / 1024 / 1024)
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        None
    }
}

/// Parse Linux /proc/meminfo content to get total memory in MB
#[cfg(target_os = "linux")]
fn parse_linux_meminfo(content: &str) -> Option<u64> {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            // Format: "MemTotal:        16384000 kB"
            let kb: u64 = rest.split_whitespace().next()?.parse().ok()?;
            return Some(kb / 1024);
        }
    }
    None
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let parsed = parse_args(&args);
    let script = get_script_path();

    // Calculate memory limit once (50% of system memory)
    let memory_limit_mb = get_system_memory_mb().map(|mb| mb / 2);
    let should_set_memory = memory_limit_mb.is_some() && !user_set_memory_limit();

    // Restart loop: exit code 77 means "restart me"
    loop {
        let mut cmd = Command::new("node");

        // Node.js flags (must come before script)
        if parsed.enable_source_maps {
            cmd.arg("--enable-source-maps");
        }
        if let (true, Some(mb)) = (should_set_memory, memory_limit_mb) {
            cmd.arg(format!("--max-old-space-size={}", mb));
        }

        // User's Node.js flags (--inspect, etc.)
        cmd.args(&parsed.node_flags);

        // Script and script arguments
        cmd.arg(&script).args(&parsed.script_args);

        // Environment variables
        cmd.env("NEXT_RUST_CLI", "1");

        // macOS: limit file watchers to avoid slow cleanup
        // https://github.com/nodejs/node/issues/29949
        #[cfg(target_os = "macos")]
        if parsed.script_args.first().map(|s| s.as_str()) == Some("dev") {
            cmd.env("WATCHPACK_WATCHER_LIMIT", "20");
        }

        let status = cmd.status().expect("failed to execute node");
        let code = status.code().unwrap_or(1);

        if code != RESTART_EXIT_CODE {
            exit(code);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_args_basic() {
        let args = vec!["next".into(), "dev".into()];
        let parsed = parse_args(&args);

        assert!(parsed.node_flags.is_empty());
        assert_eq!(parsed.script_args, vec!["dev"]);
        assert!(parsed.enable_source_maps);
    }

    #[test]
    fn test_parse_args_with_inspect() {
        let args = vec!["next".into(), "dev".into(), "--inspect".into()];
        let parsed = parse_args(&args);

        assert_eq!(parsed.node_flags, vec!["--inspect"]);
        assert_eq!(parsed.script_args, vec!["dev"]);
    }

    #[test]
    fn test_parse_args_with_inspect_port() {
        let args = vec!["next".into(), "--inspect=9229".into(), "dev".into()];
        let parsed = parse_args(&args);

        assert_eq!(parsed.node_flags, vec!["--inspect=9229"]);
        assert_eq!(parsed.script_args, vec!["dev"]);
    }

    #[test]
    fn test_parse_args_with_inspect_brk() {
        let args = vec!["next".into(), "dev".into(), "--inspect-brk".into()];
        let parsed = parse_args(&args);

        assert_eq!(parsed.node_flags, vec!["--inspect-brk"]);
        assert_eq!(parsed.script_args, vec!["dev"]);
    }

    #[test]
    fn test_parse_args_disable_source_maps() {
        let args = vec!["next".into(), "dev".into(), "--disable-source-maps".into()];
        let parsed = parse_args(&args);

        assert!(!parsed.enable_source_maps);
        assert_eq!(parsed.script_args, vec!["dev", "--disable-source-maps"]);
    }

    #[test]
    fn test_parse_args_complex() {
        let args = vec![
            "next".into(),
            "--inspect=9229".into(),
            "dev".into(),
            "--port".into(),
            "3001".into(),
            "--inspect-brk=9230".into(),
        ];
        let parsed = parse_args(&args);

        assert_eq!(
            parsed.node_flags,
            vec!["--inspect=9229", "--inspect-brk=9230"]
        );
        assert_eq!(parsed.script_args, vec!["dev", "--port", "3001"]);
        assert!(parsed.enable_source_maps);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_parse_linux_meminfo() {
        let content = "MemTotal:        16384000 kB\nMemFree:         1234567 kB\n";
        assert_eq!(parse_linux_meminfo(content), Some(16000)); // 16384000 / 1024 = 16000

        let content = "MemTotal:       8000000 kB\n";
        assert_eq!(parse_linux_meminfo(content), Some(7812)); // 8000000 / 1024 = 7812

        let content = "SomeOther: 12345 kB\n";
        assert_eq!(parse_linux_meminfo(content), None);
    }
}
