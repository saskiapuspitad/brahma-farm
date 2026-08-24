import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const enc = new TextEncoder();

/**
 * Lindungi halaman dashboard: wajib access token valid. API menegakkan RBAC sendiri.
 * Middleware berjalan di Edge — hanya verifikasi tanda tangan JWT (tanpa DB).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtectedPage =
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    pathname !== "/favicon.ico";

  if (!isProtectedPage) return NextResponse.next();

  const token = req.cookies.get("access_token")?.value;
  if (!token) return redirectLogin(req);
  try {
    await jwtVerify(token, enc.encode(process.env.JWT_ACCESS_SECRET ?? "dev-access"));
    return NextResponse.next();
  } catch {
    return redirectLogin(req);
  }
}

function redirectLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
