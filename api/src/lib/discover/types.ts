// URL patterns to filter out as noise (analytics, tracking, static assets)
export const NOISE_PATTERNS = [
  // Analytics
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /analytics\./i,
  /hotjar\.com/i,
  /segment\.(io|com)/i,
  /mixpanel\.com/i,
  /amplitude\.com/i,
  /fullstory\.com/i,
  // Tracking
  /facebook\.com\/(tr|signals)/i,
  /connect\.facebook/i,
  /doubleclick\.net/i,
  /ads\./i,
  /pixel\./i,
  /tracking\./i,
  // Static assets
  /\.(woff2?|ttf|eot|otf)(\?|$)/i,
  /\.(png|jpe?g|gif|svg|webp|avif|ico)(\?|$)/i,
  /\.(css|less|scss)(\?|$)/i,
  /\.(js|mjs)(\?|$)/i,
  // CDN noise
  /cdn\./i,
  /cloudflare/i,
  /jsdelivr/i,
  /unpkg\.com/i,
];

export function isNoiseRequest(url: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(url));
}

export function isApiLikeResponse(contentType: string): boolean {
  return (
    contentType.includes("application/json") ||
    contentType.includes("application/xml") ||
    contentType.includes("text/xml")
  );
}
