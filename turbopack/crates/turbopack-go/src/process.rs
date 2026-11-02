//! Subprocess ownership includes compiler children, including during cancellation.
#[cfg(target_family = "wasm")]
pub(crate) use std::process::Command;
#[cfg(not(target_family = "wasm"))]
use std::{pin::Pin, process::Stdio, time::Duration};

#[cfg(not(target_family = "wasm"))]
use anyhow::Context;
use anyhow::Result;
#[cfg(not(target_family = "wasm"))]
pub(crate) use tokio::process::Command;
use tokio_util::sync::CancellationToken;

#[cfg(not(target_family = "wasm"))]
const SLOW_COMMAND: Duration = Duration::from_secs(180);

#[cfg(not(target_family = "wasm"))]
struct ProcessGroup(Option<u32>);

#[cfg(not(target_family = "wasm"))]
impl ProcessGroup {
    fn terminate(&mut self) {
        let Some(pid) = self.0.take() else { return };
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill.exe")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        #[cfg(unix)]
        {
            // The child owns a new process group. Cancellation must also stop its compiler/linker
            // children. Disarm this guard immediately after wait succeeds, before PID reuse.
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
    }
}

#[cfg(not(target_family = "wasm"))]
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        self.terminate();
    }
}

#[cfg(not(target_family = "wasm"))]
struct PendingOutput<F> {
    // Fields drop in declaration order. Keep the parent alive until tree termination has
    // completed: Windows taskkill /T needs the parent to enumerate its descendants.
    group: ProcessGroup,
    output: Pin<Box<F>>,
}

#[cfg(not(target_family = "wasm"))]
pub(crate) async fn output(
    command: Command,
    cancel: &CancellationToken,
) -> Result<std::process::Output> {
    output_with_input(command, cancel, None).await
}

#[cfg(target_family = "wasm")]
pub(crate) async fn output(
    _command: Command,
    _cancel: &CancellationToken,
) -> Result<std::process::Output> {
    anyhow::bail!(
        "Go compilation requires a native host with Go 1.24 or newer; subprocess execution is \
         unavailable on WebAssembly"
    )
}

#[cfg(target_family = "wasm")]
pub(crate) async fn output_with_input(
    command: Command,
    cancel: &CancellationToken,
    _input: Option<&[u8]>,
) -> Result<std::process::Output> {
    output(command, cancel).await
}

#[cfg(not(target_family = "wasm"))]
pub(crate) async fn output_with_input(
    mut command: Command,
    cancel: &CancellationToken,
    input: Option<&[u8]>,
) -> Result<std::process::Output> {
    command
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.as_std_mut().process_group(0);
    }
    let mut child = command
        .spawn()
        .context("starting Go; install Go 1.24 or newer or use --go")?;
    let stdin = child.stdin.take();
    let mut pending = PendingOutput {
        group: ProcessGroup(child.id()),
        output: Box::pin(async move {
            if let (Some(mut stdin), Some(input)) = (stdin, input) {
                use tokio::io::AsyncWriteExt;
                stdin.write_all(input).await?;
            }
            child.wait_with_output().await
        }),
    };
    let warning = tokio::time::sleep(SLOW_COMMAND);
    tokio::pin!(warning);
    let mut warned = false;
    let (result, wait_pending) = loop {
        tokio::select! {
            result = &mut pending.output => break (result.context("waiting for Go"), false),
            _ = cancel.cancelled() => break (Err(anyhow::anyhow!("Go build cancelled")), true),
            _ = &mut warning, if !warned => {
                eprintln!("Go command has been running for 180 seconds; waiting for it to finish");
                warned = true;
            }
        }
    };
    if result.is_ok() {
        pending.group.0 = None;
    } else {
        pending.group.terminate();
        // Reap the child after killing its tree. If pipe cleanup stalls, kill_on_drop remains
        // a final fallback; cancellation still returns within a bounded time.
        if wait_pending {
            let _ = tokio::time::timeout(Duration::from_secs(5), &mut pending.output).await;
        }
    }
    result
}

#[cfg(all(test, not(target_family = "wasm")))]
mod tests {
    use std::{path::Path, time::Instant};

    use super::*;

    const HELPER: &str = "process::tests::child_process_helper";

    fn helper(control: &Path, role: &str) -> std::process::Command {
        let mut command = std::process::Command::new(std::env::current_exe().unwrap());
        command
            .args(["--ignored", "--exact", HELPER, "--nocapture"])
            .env("TURBOPACK_GO_TEST_CONTROL", control)
            .env("TURBOPACK_GO_TEST_ROLE", role);
        command
    }

    // This is an entrypoint for controlled subprocesses, not a skipped assertion. The tests
    // below invoke it in fresh processes and verify cancellation and dropped-future cleanup.
    #[test]
    #[ignore = "Subprocess fixture invoked by process cleanup tests"]
    fn child_process_helper() {
        let control = std::env::var_os("TURBOPACK_GO_TEST_CONTROL").unwrap();
        let control = Path::new(&control);
        let role = std::env::var("TURBOPACK_GO_TEST_ROLE").unwrap();
        let mut descendant =
            (role == "parent").then(|| helper(control, "descendant").spawn().unwrap());
        std::fs::write(
            control.join(format!("{role}.pid")),
            std::process::id().to_string(),
        )
        .unwrap();
        std::fs::write(control.join(format!("{role}.ready")), "").unwrap();
        let deadline = Instant::now() + Duration::from_secs(120);
        while Instant::now() < deadline && !control.join("release").exists() {
            std::thread::sleep(Duration::from_millis(20));
        }
        if let Some(child) = &mut descendant {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    struct AbortOnDrop(tokio::task::AbortHandle);
    impl Drop for AbortOnDrop {
        fn drop(&mut self) {
            self.0.abort();
        }
    }

    struct ProcessTree {
        parent: u32,
        descendant: Option<u32>,
    }
    impl Drop for ProcessTree {
        fn drop(&mut self) {
            // Also clean up if an assertion fails before cancellation.
            if self.parent != 0 {
                ProcessGroup(Some(self.parent)).terminate();
            }
            #[cfg(windows)]
            if let Some(pid) = self.descendant {
                ProcessGroup(Some(pid)).terminate();
            }
            #[cfg(unix)]
            if let Some(pid) = self.descendant {
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
            }
        }
    }

    #[cfg(unix)]
    struct Monitor(u32);
    #[cfg(unix)]
    impl Monitor {
        fn new(pid: u32) -> Self {
            Self(pid)
        }
        fn running(&self) -> bool {
            // Linux may retain an orphaned zombie until init reaps it. It has already
            // terminated and cannot execute; do not mistake that for a live compiler.
            #[cfg(target_os = "linux")]
            if std::fs::read_to_string(format!("/proc/{}/stat", self.0)).is_ok_and(|stat| {
                stat.rsplit_once(") ")
                    .is_some_and(|(_, fields)| fields.starts_with("Z "))
            }) {
                return false;
            }
            unsafe { libc::kill(self.0 as i32, 0) == 0 }
        }
    }

    #[cfg(windows)]
    struct Monitor(windows_sys::Win32::Foundation::HANDLE);
    #[cfg(windows)]
    impl Monitor {
        fn new(pid: u32) -> Self {
            use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SYNCHRONIZE};
            let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
            assert!(!handle.is_null(), "cannot monitor test process {pid}");
            Self(handle)
        }
        fn running(&self) -> bool {
            use windows_sys::Win32::{
                Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT},
                System::Threading::WaitForSingleObject,
            };
            match unsafe { WaitForSingleObject(self.0, 0) } {
                WAIT_TIMEOUT => true,
                WAIT_OBJECT_0 => false,
                result => panic!("waiting for test process failed: {result}"),
            }
        }
    }
    #[cfg(windows)]
    impl Drop for Monitor {
        fn drop(&mut self) {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(self.0);
            }
        }
    }

    async fn wait(mut predicate: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(15);
        while !predicate() {
            assert!(
                Instant::now() < deadline,
                "timed out waiting for subprocess"
            );
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }

    #[derive(Clone, Copy)]
    enum Completion {
        Cancel,
        DropFuture,
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn cancellation_terminates_process_tree() {
        verify_process_tree_cleanup(Completion::Cancel).await;
        verify_process_tree_cleanup(Completion::DropFuture).await;
    }

    async fn verify_process_tree_cleanup(completion: Completion) {
        let control = tempfile::tempdir().unwrap();
        let token = CancellationToken::new();
        let command = Command::from(helper(control.path(), "parent"));
        let work_token = token.clone();
        let work = tokio::spawn(async move { output(command, &work_token).await });
        let _abort_on_drop = AbortOnDrop(work.abort_handle());
        // Both processes record their own PID before signaling readiness.
        wait(|| control.path().join("parent.ready").exists()).await;
        let parent = std::fs::read_to_string(control.path().join("parent.pid"))
            .unwrap()
            .parse()
            .unwrap();
        let mut tree = ProcessTree {
            parent,
            descendant: None,
        };
        wait(|| control.path().join("descendant.ready").exists()).await;
        let descendant = std::fs::read_to_string(control.path().join("descendant.pid"))
            .unwrap()
            .parse()
            .unwrap();
        tree.descendant = Some(descendant);
        let parent = Monitor::new(parent);
        let descendant = Monitor::new(descendant);
        assert!(parent.running() && descendant.running());
        match completion {
            Completion::DropFuture => {
                work.abort();
                assert!(work.await.unwrap_err().is_cancelled());
            }
            Completion::Cancel => {
                token.cancel();
                assert!(
                    work.await
                        .unwrap()
                        .unwrap_err()
                        .to_string()
                        .contains("Go build cancelled")
                );
            }
        }
        wait(|| !parent.running() && !descendant.running()).await;
        // Avoid reusing a terminated PID in cleanup after the assertion succeeds.
        tree.parent = 0;
        tree.descendant = None;
    }
}
