/**
 * Dev mode flag — controls visibility of debug features in the UI.
 *
 * Set NEXT_PUBLIC_DEV_MODE=true in web/.env.local for development.
 * In production, this is unset → all debug features hidden.
 */
export const IS_DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";
