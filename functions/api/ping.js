// functions/api/ping.js
export function onRequestGet() {
  return new Response('pong');
}