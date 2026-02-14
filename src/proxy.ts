import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "vdesk_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthed = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/" && isAuthed) {
    return NextResponse.redirect(new URL("/desktop", request.url));
  }

  if (pathname.startsWith("/home") && !isAuthed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/home/:path*"],
};
