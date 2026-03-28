import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old /results/:domain to /app/results/:domain
  if (pathname.startsWith("/results/")) {
    const newUrl = request.nextUrl.clone();
    newUrl.pathname = `/app${pathname}`;
    return NextResponse.redirect(newUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/results/:path*"],
};
