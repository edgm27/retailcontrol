import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware de borde: SOLO cabeceras de seguridad, CSP con nonce, correlation
 * ID y una redirección optimista si no hay cookie de sesión. La autorización
 * real (sesión válida, MFA, membresía, permisos) se hace en el servidor.
 */
const PROTECTED = ["/app", "/empresas", "/cuenta", "/onboarding", "/mfa", "/invitacion"];
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const incoming = req.headers.get("x-correlation-id");
  const correlationId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();

  const { pathname, search } = req.nextUrl;
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (!hasSession && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-correlation-id", correlationId);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

export const config = {
  matcher: [
    { source: "/((?!_next/static|_next/image|favicon.ico|api/health|media/).*)" },
  ],
};
