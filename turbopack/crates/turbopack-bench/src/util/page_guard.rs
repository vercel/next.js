use std::{sync::Arc, time::Duration};

use anyhow::{Context, Result, anyhow};
use chromiumoxide::{
    Page,
    cdp::js_protocol::runtime::{EventBindingCalled, EventExceptionThrown},
    listeners::EventStream,
};
use futures::{Stream, StreamExt};
use tokio::time::timeout;

use crate::{BINDING_NAME, PreparedApp};

const MAX_HYDRATION_TIMEOUT: Duration = Duration::from_secs(120);
const TEST_APP_HYDRATION_DONE: &str = "Hydration done";

/// Closes a browser page on Drop.
pub struct PageGuard<'a> {
    page: Option<Page>,
    app: Option<PreparedApp<'a>>,
    events: Box<dyn Stream<Item = Event> + Unpin>,
}

enum Event {
    EventBindingCalled(Arc<EventBindingCalled>),
    EventExceptionThrown(Arc<EventExceptionThrown>),
}

impl<'a> PageGuard<'a> {
    /// Creates a new guard for the given page.
    pub fn new(
        page: Page,
        events: EventStream<EventBindingCalled>,
        errors: EventStream<EventExceptionThrown>,
        app: PreparedApp<'a>,
    ) -> Self {
        Self {
            page: Some(page),
            app: Some(app),
            events: Box::new(futures::stream::select(
                events.map(Event::EventBindingCalled),
                errors.map(Event::EventExceptionThrown),
            )),
        }
    }

    /// Returns a reference to the page.
    pub fn page(&self) -> &Page {
        // Invariant: page is always Some while the guard is alive.
        self.page.as_ref().unwrap()
    }

    /// Closes the page, returns the app.
    pub async fn close_page(mut self) -> Result<PreparedApp<'a>> {
        // Invariant: the page is always Some while the guard is alive.
        self.page.take().unwrap().close().await?;
        Ok(
            // Invariant: the app is always Some while the guard is alive.
            self.app.take().unwrap(),
        )
    }

    /// Waits until the binding is called with the given payload.
    pub async fn wait_for_binding(&mut self, payload: &str) -> Result<()> {
        while let Some(event) = self.events.next().await {
            match event {
                Event::EventBindingCalled(event) => {
                    if event.name == BINDING_NAME && event.payload == payload {
                        return Ok(());
                    }
                }
                Event::EventExceptionThrown(event) => {
                    anyhow::bail!("Exception throw in page: {}", event.exception_details)
                }
            }
        }

        Err(anyhow!("event stream ended before binding was called"))
    }

    /// Waits until the page and the page JavaScript is hydrated.
    pub async fn wait_for_hydration(&mut self) -> Result<()> {
        timeout(
            MAX_HYDRATION_TIMEOUT,
            self.wait_for_binding(TEST_APP_HYDRATION_DONE),
        )
        .await
        .context("Timeout happened while waiting for hydration")?
        .context("Error happened while waiting for hydration")?;
        Ok(())
    }
}

impl Drop for PageGuard<'_> {
    fn drop(&mut self) {
        // The page might have been closed already in `close_page`.
        if let Some(page) = self.page.take() {
            // This is a way to block on a future in a destructor. It's not ideal, but for
            // the purposes of this benchmark it's fine.
            futures::executor::block_on(page.close()).expect("failed to close page");
        }
    }
}
