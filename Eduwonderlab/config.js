// config.js — safe, public runtime configuration only
// NEVER put PINs, tokens, passwords, or valid code lists here.
// Secrets and access control live in _worker.js environment variables.

window.EWL_CONFIG = {
  APP_NAME: "EduWonderLab",

  // Base URL for API calls — useful if you ever move the API to a separate domain
  API_BASE: "",

  // Display-only session hint (actual expiry enforced server-side)
  SESSION_TTL_MIN: 720,

  // Feature flags — safe for public config
  FEATURES: {
    showRecent: true,
    showFavorites: true
  }
};
