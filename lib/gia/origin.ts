export function sameOrigin(req: Request) {
  // Explicit canonical origin supports reverse proxies without trusting forwarded headers.
  const origin = process.env.GIA_PUBLIC_ORIGIN || new URL(req.url).origin;
  return req.headers.get('origin') === origin;
}
