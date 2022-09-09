use std::{
    path::{Path, PathBuf},
    process::Child,
};

use anyhow::{anyhow, Context, Result};
use chromiumoxide::{
    cdp::{
        browser_protocol::network::EventResponseReceived,
        js_protocol::runtime::{AddBindingParams, EventBindingCalled, EventExceptionThrown},
    },
    Browser, Page,
};
use futures::{FutureExt, StreamExt};
use url::Url;

use crate::{bundlers::Bundler, util::PageGuard, BINDING_NAME};

pub struct PreparedApp<'a> {
    bundler: &'a dyn Bundler,
    server: Option<(Child, String)>,
    test_dir: tempfile::TempDir,
    counter: usize,
}

impl<'a> PreparedApp<'a> {
    pub fn new(bundler: &'a dyn Bundler, template_dir: PathBuf) -> Result<Self> {
        let test_dir = tempfile::tempdir()?;

        fs_extra::dir::copy(
            &template_dir,
            &test_dir,
            &fs_extra::dir::CopyOptions {
                content_only: true,
                ..fs_extra::dir::CopyOptions::default()
            },
        )?;

        Ok(Self {
            bundler,
            server: None,
            test_dir,
            counter: 0,
        })
    }

    pub fn counter(&mut self) -> usize {
        self.counter += 1;
        self.counter
    }

    pub fn start_server(&mut self) -> Result<()> {
        assert!(self.server.is_none(), "Server already started");

        self.server = Some(self.bundler.start_server(self.test_dir.path())?);

        Ok(())
    }

    pub async fn with_page(self, browser: &Browser) -> Result<PageGuard<'a>> {
        let server = self.server.as_ref().context("Server must be started")?;
        let page = browser.new_page("about:blank").await?;
        // Bindings survive page reloads. Set them up as early as possible.
        add_binding(&page).await?;

        let mut errors = page.event_listener::<EventExceptionThrown>().await?;
        let binding_events = page.event_listener::<EventBindingCalled>().await?;
        let mut network_response_events = page.event_listener::<EventResponseReceived>().await?;

        let destination = Url::parse(&server.1)?.join(self.bundler.get_path())?;
        // We can't use page.goto() here since this will wait for the naviation to be
        // completed. A naviation would be complete when all sync script are
        // evaluated, but the page actually can rendered earlier without JavaScript
        // needing to be evaluated.
        // So instead we navigate via JavaScript and wait only for the HTML response to
        // be completed.
        page.evaluate_expression(format!("window.location='{destination}'"))
            .await?;

        // Wait for HTML response completed
        loop {
            match network_response_events.next().await {
                Some(event) => {
                    if event.response.url == destination.as_str() {
                        break;
                    }
                }
                None => return Err(anyhow!("event stream ended too early")),
            }
        }

        // Make sure no runtime errors occurred when loading the page
        assert!(errors.next().now_or_never().is_none());

        let page_guard = PageGuard::new(page, binding_events, self);

        Ok(page_guard)
    }

    pub fn stop_server(&mut self) -> Result<()> {
        let mut proc = self.server.take().expect("Server never started").0;
        stop_process(&mut proc)?;
        Ok(())
    }

    pub fn path(&self) -> &Path {
        self.test_dir.path()
    }
}

impl<'a> Drop for PreparedApp<'a> {
    fn drop(&mut self) {
        if let Some(mut server) = self.server.take() {
            stop_process(&mut server.0).expect("failed to stop process");
        }
    }
}

/// Adds benchmark-specific bindings to the page.
async fn add_binding(page: &Page) -> Result<()> {
    page.execute(AddBindingParams::new(BINDING_NAME)).await?;
    Ok(())
}

#[cfg(unix)]
fn stop_process(proc: &mut Child) -> Result<()> {
    use std::time::Duration;

    use nix::{
        sys::signal::{kill, Signal},
        unistd::Pid,
    };

    const KILL_DEADLINE: Duration = Duration::from_secs(5);
    const KILL_DEADLINE_CHECK_STEPS: u32 = 10;

    let pid = Pid::from_raw(proc.id() as _);
    match kill(pid, Signal::SIGINT) {
        Ok(()) => {
            let expire = std::time::Instant::now() + KILL_DEADLINE;
            while let Ok(None) = proc.try_wait() {
                if std::time::Instant::now() > expire {
                    break;
                }
                std::thread::sleep(KILL_DEADLINE / KILL_DEADLINE_CHECK_STEPS);
            }
            if let Ok(None) = proc.try_wait() {
                eprintln!("Process {} did not exit after SIGINT, sending SIGKILL", pid);
                kill_process(proc)?;
            }
        }
        Err(_) => {
            eprintln!("Failed to send SIGINT to process {}, sending SIGKILL", pid);
            kill_process(proc)?;
        }
    }
    Ok(())
}

#[cfg(not(unix))]
fn stop_process(proc: &mut Child) -> Result<()> {
    kill_process(proc)
}

fn kill_process(proc: &mut Child) -> Result<()> {
    proc.kill()?;
    proc.wait()?;
    Ok(())
}
