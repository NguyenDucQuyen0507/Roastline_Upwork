/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Roastline API, e.g. https://roastline-api.onrender.com/api/v1. Defaults to /api/v1 (Vite proxy). */
  readonly VITE_API_URL?: string;
  /** Sent as X-API-Key on write requests. Defaults to demo-key. */
  readonly VITE_API_KEY?: string;
}
