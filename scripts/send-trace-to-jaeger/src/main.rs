use reqwest;
use serde_json;
use std::env::args;
use std::fs::File;
use std::io::{self, BufRead};
use std::path::Path;

// The output is wrapped in a Result to allow matching on errors
// Returns an Iterator to the Reader of the lines of the file.
fn read_lines<P>(filename: P) -> io::Result<io::Lines<io::BufReader<File>>>
where
    P: AsRef<Path>,
{
    let file = File::open(filename)?;
    Ok(io::BufReader::new(file).lines())
}

fn log_web_url(jaeger_web_ui_url: &str, trace_id: &str) {
    println!(
        "Jaeger trace will be available on {}/trace/{}",
        jaeger_web_ui_url.to_string(),
        trace_id.to_string()
    )
}

fn send_json_to_zipkin(zipkin_api: &str, value: &str) {
    let client = reqwest::blocking::Client::new();

    let res = client
        .post(zipkin_api)
        .header("Content-Type", "application/json")
        .body(value.to_string())
        .send()
        .expect("Failed to send request");

    println!("body = {:?}", res.text());
}

fn main() {
    let service_name = "nextjs";
    let ipv4 = "127.0.0.1";
    let port = 9411;
    let zipkin_url = format!("http://{}:{}", ipv4, port);
    let jaeger_web_ui_url = format!("http://{}:16686", ipv4);
    let zipkin_api = format!("{}/api/v2/spans", zipkin_url);
    let mut logged_url = false;

    let mut local_endpoint = serde_json::Map::new();
    local_endpoint.insert(
        "serviceName".to_string(),
        serde_json::Value::String(service_name.to_string()),
    );
    local_endpoint.insert(
        "ipv4".to_string(),
        serde_json::Value::String(ipv4.to_string()),
    );
    local_endpoint.insert(
        "port".to_string(),
        serde_json::Value::Number(serde_json::Number::from(port)),
    );

    let first_arg = args().nth(1).expect("Please provide a file name");
    // File hosts must exist in current path before this produces output
    if let Ok(lines) = read_lines(first_arg) {
        // Consumes the iterator, returns an (Optional) String
        for line in lines {
            if let Ok(json_to_parse) = line {
                let v: Vec<serde_json::Value> = match serde_json::from_str(&json_to_parse) {
                    Ok(v) => v,
                    Err(e) => {
                        println!("{}", e);
                        continue;
                    }
                };

                let mapped = v
                    .iter()
                    .map(|data| {
                        if !logged_url {
                            log_web_url(&jaeger_web_ui_url, &data["traceId"].to_string());
                            logged_url = true;
                        }
                        let mut data = data.clone();
                        data["localEndpoint"] = serde_json::Value::Object(local_endpoint.clone());
                        data
                    })
                    .collect::<serde_json::Value>();

                let json_map = serde_json::to_string(&mapped).expect("Failed to serialize");

                send_json_to_zipkin(&zipkin_api, &json_map);
            }
        }
    }
}
