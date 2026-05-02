// BYO API key UI + localStorage persistence.
// Demo-mode shared key (if VITE_DEMO_ANTHROPIC_API_KEY is set) is rate-limited
// at the dashboard level -- $5/month hard cap per CLAUDE.md.

const STORAGE_KEY = "expr-reader.anthropic-key";

export function getUserApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setUserApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearUserApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getDemoApiKey(): string | null {
  const k = import.meta.env.VITE_DEMO_ANTHROPIC_API_KEY;
  return k && k.length > 0 ? k : null;
}

export function getActiveApiKey(): string | null {
  return getUserApiKey() ?? getDemoApiKey();
}
