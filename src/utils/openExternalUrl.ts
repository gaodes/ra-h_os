"use client";

export async function openExternalUrl(url: string) {
  if (typeof window === "undefined") return;

  try {
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!newWindow) {
      window.location.href = url;
    }
  } catch (error) {
    console.error("[external] window.open failed", error);
    window.location.href = url;
  }
}

export function shouldOpenExternally(rawUrl: string) {
  if (typeof window === "undefined") return false;

  try {
    const resolved = new URL(rawUrl, window.location.href);
    if (!["http:", "https:"].includes(resolved.protocol)) {
      return false;
    }

    const localhostHosts = new Set([
      window.location.hostname,
      "127.0.0.1",
      "localhost",
      "0.0.0.0",
    ]);

    return !localhostHosts.has(resolved.hostname);
  } catch (error) {
    console.error("[external] failed to parse url", rawUrl, error);
    return false;
  }
}
