vcl 4.0;

import std;

backend node {
  .host = "node";
  .port = "80";
}

sub vcl_backend_response {
  # Enable ESI support
  if (beresp.http.Surrogate-Control ~ "ESI/1.0") {
    unset beresp.http.Surrogate-Control;
    set beresp.do_esi = true;
  }
}

sub vcl_recv {
  # Remove cookies to prevent a cache miss, you maybe don't want to do this!
  unset req.http.cookie;

  # Announce ESI support to Node (optional)
  set req.http.Surrogate-Capability = "key=ESI/1.0";
}
