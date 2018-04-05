"use strict";

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| Http routes are entry points to your web application. You can create
| routes for different URL's and bind Controller actions to them.
|
| A complete guide on routing is available here.
| http://adonisjs.com/docs/4.0/routing
|
*/

const Route = use("Route");
const Next = use("Adonis/Addons/Next");
const handle = Next.getRequestHandler();

// API Endpoint for your database
Route.get("/api", ({ request }) => {
  return { greeting: "I'm Api Endpoint" };
});

// // Your Next.js app

Route.get("/a", ({ request, response }) => {
  return Next.render(request.request, response.response, "/b", request.request.query);
});

Route.get("/b", ({ request, response }) => {
  return Next.render(request.request, response.response, "/a", request.request.query);
});

Route.get("/posts/:id", ({ request, response }) => {
  return Next.render(request.request, response.response, "/posts", {
    id: request.request.params.id
  });
});

Route.get("*", ({ request, response }) => {
  return handle(request.request, response.response);
});
