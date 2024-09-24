use std::sync::Arc;

use crate::{turbo_tasks, turbo_tasks_scope, TurboTasksApi};

pub struct Scope<'scope, 'a> {
    scope: &'a rayon::Scope<'scope>,
    handle: tokio::runtime::Handle,
    turbo_tasks: Arc<dyn TurboTasksApi>,
    span: tracing::Span,
}

impl<'scope, 'a> Scope<'scope, 'a> {
    pub fn spawn<BODY>(&self, body: BODY)
    where
        BODY: FnOnce(&Scope<'scope, '_>) + Send + 'scope,
    {
        let span = self.span.clone();
        let handle = self.handle.clone();
        let turbo_tasks = self.turbo_tasks.clone();
        self.scope.spawn(|scope| {
            let _span = span.clone().entered();
            let _guard = handle.enter();
            turbo_tasks_scope(turbo_tasks.clone(), || {
                body(&Scope {
                    scope,
                    span,
                    handle,
                    turbo_tasks,
                })
            })
        });
    }
}

pub fn scope<'scope, OP, R>(op: OP) -> R
where
    OP: FnOnce(&Scope<'scope, '_>) -> R,
{
    let span = tracing::Span::current();
    let handle = tokio::runtime::Handle::current();
    let turbo_tasks = turbo_tasks();
    rayon::in_place_scope(|scope| {
        op(&Scope {
            scope,
            span,
            handle,
            turbo_tasks,
        })
    })
}
