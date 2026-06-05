use crate::{next_client::ClientContextType, next_server::ServerContextType};

pub(crate) mod resolve;
pub(crate) mod transforms;
pub(crate) mod webpack_rules;

#[turbo_tasks::value(shared, task_input)]
#[derive(Debug, Clone, Hash)]
enum ContextType {
    Client(ClientContextType),
    Server(ServerContextType),
}
