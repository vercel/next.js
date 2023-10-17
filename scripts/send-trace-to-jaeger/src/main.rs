use std::{
    env::args,
    fs::File,
    io::{self, BufRead},
    path::Path,
};

use reqwest::blocking::Client;
use serde_json::{Map, Number, Value};

/// Read individual lines from a file.
fn read_lines<P>(filename: P) -> io::Result<io::Lines<io::BufReader<File>>>
where
    P: AsRef<Path>,
{
    let file = File::open(filename)?;
    Ok(io::BufReader::new(file).lines())
}

/// Log the url to view the trace in the browser.
fn log_web_url(jaeger_web_ui_url: &str, trace_id: &str) {
    println!(
        "Jaeger trace will be available on {}/trace/{}",
        jaeger_web_ui_url, trace_id
    )
}

/// Send trace JSON to Jaeger using ZipKin API.
fn send_json_to_zipkin(zipkin_api: &str, value: String) {
    let client = Client::new();

    let res = client
        .post(zipkin_api)
        .header("Content-Type", "application/json")
        .body(value)
        .send()
        .expect("Failed to send request");

    println!("body = {:?}", res.text());
}

// function to append zero to a number until 16 characters
fn pad_zeros(num: u64) -> String {
    let mut num_str = num.to_string();
    while num_str.len() < 16 {
        num_str = format!("0{}", num_str);
    }
    num_str
}

fn main() {
    let service_name = "nextjs";
    let ipv4 = "127.0.0.1";
    let port = 9411;
    let zipkin_url = format!("http://{}:{}", ipv4, port);
    let jaeger_web_ui_url = format!("http://{}:16686", ipv4);
    let zipkin_api = format!("{}/api/v2/spans", zipkin_url);
    let mut logged_url = false;

    let mut local_endpoint = Map::new();
    local_endpoint.insert(
        "serviceName".to_string(),
        Value::String(service_name.to_string()),
    );
    local_endpoint.insert("ipv4".to_string(), Value::String(ipv4.to_string()));
    local_endpoint.insert("port".to_string(), Value::Number(Number::from(port)));

    let first_arg = args().nth(1).expect("Please provide a file name");

    if let Ok(lines) = read_lines(first_arg) {
        for json_to_parse in lines.flatten() {
            let v = match serde_json::from_str::<Vec<Value>>(&json_to_parse) {
                Ok(v) => v
                    .into_iter()
                    .map(|mut data| {
                        if !logged_url {
                            log_web_url(&jaeger_web_ui_url, data["traceId"].as_str().unwrap());
                            logged_url = true;
                        }
                        data["localEndpoint"] = Value::Object(local_endpoint.clone());

                        data["id"] = Value::String(pad_zeros(data["id"].as_u64().unwrap()));
                        if data["parentId"] != Value::Null {
                            data["parentId"] =
                                Value::String(pad_zeros(data["parentId"].as_u64().unwrap()));
                        }

                        data
                    })
                    .collect::<Value>(),
                Err(e) => {
                    println!("{}", e);
                    continue;
                }
            };

            let json_map = serde_json::to_string(&v).expect("Failed to serialize");

            // println!("{:}", json_map);

            send_json_to_zipkin(&zipkin_api, json_map);
        }
    }
}
