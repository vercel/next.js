use std::{
    net::{SocketAddr, SocketAddrV4, TcpListener, TcpStream},
    sync::Arc,
    thread::spawn,
};

use anyhow::Result;
use tungstenite::{Message, accept};

use crate::{protocol::ProtocolSession, store_container::StoreContainer};

pub fn serve(store: Arc<StoreContainer>, port: u16) {
    let server = TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(
        std::net::Ipv4Addr::new(127, 0, 0, 1),
        port,
    )))
    .unwrap();
    for stream in server.incoming() {
        let store = store.clone();

        spawn(move || {
            let websocket = accept(stream.unwrap()).unwrap();
            if let Err(err) = handle_connection(websocket, store) {
                eprintln!("Error: {err:?}");
            }
        });
    }
}

fn handle_connection(
    mut websocket: tungstenite::WebSocket<TcpStream>,
    store: Arc<StoreContainer>,
) -> Result<()> {
    let mut session = ProtocolSession::new(store);
    loop {
        match websocket.read()? {
            Message::Frame(_) | Message::Binary(_) | Message::Pong(_) => {}
            Message::Text(text) => {
                for response in session.handle_text(&text)? {
                    websocket.send(Message::Text(response))?;
                }
            }
            Message::Close(_) => return Ok(()),
            Message::Ping(data) => websocket.send(Message::Pong(data))?,
        }
    }
}
