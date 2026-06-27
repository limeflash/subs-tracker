import { prisma } from "@/lib/db";
import { lookup } from "node:dns/promises";

const MAX_BYTES = 256 * 1024; // 256KB
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function hostFromUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "") || url;
  }
}

/**
 * Resolve `hostname` and confirm every address is public. Returns the first
 * public resolved address so the caller can pin the fetch to it (closing the
 * DNS-rebinding TOCTOU window — without pinning, a malicious authoritative
 * server could answer the validation lookup with a public IP and the actual
 * fetch lookup with 169.254.169.254). Returns null if the host is unsafe or
 * unresolvable. For literal IPs the input is returned unchanged (already an
 * address).
 */
async function resolvePublicAddress(hostname: string): Promise<string | null> {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return null;
  if (lower === "metadata.google.internal") return null; // cloud metadata endpoint
  // Literal IPv4?
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return isPrivateIp(lower) ? null : lower;
  // Literal IPv6?
  if (lower.includes(":")) {
    if (lower === "::1" || lower === "[::1]") return null;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return null;
    return lower; // already an address; conservative allow for public-looking v6
  }
  try {
    const res = await lookup(hostname, { all: true });
    if (res.length === 0) return null;
    let chosen: string | null = null;
    const allPublic = res.every((a) => {
      if (a.family === 4) {
        if (isPrivateIp(a.address)) return false;
        if (chosen == null) chosen = a.address;
        return true;
      }
      const v = a.address.toLowerCase();
      if (v === "::1" || v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return false;
      if (chosen == null) chosen = a.address;
      return true;
    });
    return allPublic ? chosen : null;
  } catch {
    return null;
  }
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/** A validated URL plus the pinned public IP we resolved for its host. */
interface SafeTarget {
  url: URL;
  /** Resolved public address; fetch goes to this IP with the original Host header. */
  ip: string | null;
}

/** Reject non-http(s) schemes and any host that isn't public. */
async function safeUrl(raw: string): Promise<SafeTarget | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null; // defang URL-parsing tricks
  const ip = await resolvePublicAddress(u.hostname);
  if (ip == null) return null;
  return { url: u, ip };
}

/** fetch with a hard redirect cap, re-checking each hop's host. */
async function safeFetch(
  target: SafeTarget,
  init: RequestInit & { method?: string },
): Promise<Response | null> {
  let current = target;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const { url, ip } = current;
    // Pin the request to the resolved IP so a DNS-rebinding attacker can't
    // swap the address between validation and fetch. Keep the original
    // hostname in the Host header + SNI by going to a URL with that IP and
    // setting Host explicitly.
    let fetchUrl = url;
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (compatible; SubsTracker/1.0)",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (ip && ip !== url.hostname) {
      const pinned = new URL(url.toString());
      pinned.hostname = ip;
      pinned.host = `${ip}${url.port ? ":" + url.port : ""}`;
      fetchUrl = pinned;
      headers["Host"] = url.hostname;
    }
    const res = await fetch(fetchUrl, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers,
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      const next = await safeUrl(new URL(loc, url).toString());
      if (!next) return null;
      current = next;
      continue;
    }
    return res;
  }
  return null;
}

/**
 * Resolve a favicon URL for a given site URL.
 * Strategy:
 *  1. Check FaviconCache for the host.
 *  2. Fetch the page HTML, parse <link rel="icon"|…"shortcut icon">.
 *  3. Resolve to absolute URL; sanity-check it returns an image.
 *  4. Fallback to Google's S2 favicon service.
 * Persist to cache. Never throws — returns a best-effort URL.
 */
export async function resolveFavicon(siteUrl: string): Promise<string> {
  const host = hostFromUrl(siteUrl);
  if (!host) return "";

  const cached = await prisma.faviconCache.findUnique({ where: { domain: host } });
  if (cached) return cached.faviconUrl;

  let resolved: string | null = null;

  const pageTarget = await safeUrl(`https://${host}`);
  if (pageTarget) {
    try {
      const res = await safeFetch(pageTarget, { method: "GET" });
      if (res && res.ok) {
        const html = await res.text();
        resolved = parseIconLink(html, pageTarget.url.toString());
      }
    } catch {
      /* ignore, fall back */
    }
  }

  // Verify the candidate returns an image; re-check its host is public.
  if (resolved && (await isImageUrl(resolved))) {
    await saveCache(host, resolved);
    return resolved;
  }

  const fallback = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  await saveCache(host, fallback);
  return fallback;
}

function parseIconLink(html: string, baseUrl: string): string | null {
  const re = /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  let first: string | null = null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (hrefMatch?.[1]) {
      const href = hrefMatch[1];
      try {
        first = new URL(href, baseUrl).toString();
        break;
      } catch {
        continue;
      }
    }
  }
  if (first) return first;
  try {
    return new URL("/favicon.ico", baseUrl).toString();
  } catch {
    return null;
  }
}

async function isImageUrl(url: string): Promise<boolean> {
  const u = await safeUrl(url);
  if (!u) return false;
  try {
    const res = await safeFetch(u, { method: "GET" });
    if (!res || !res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) {
      const buf = await res.arrayBuffer();
      return buf.byteLength > 0 && buf.byteLength <= MAX_BYTES;
    }
    return true;
  } catch {
    return false;
  }
}

async function saveCache(host: string, url: string) {
  try {
    await prisma.faviconCache.upsert({
      where: { domain: host },
      update: { faviconUrl: url, fetchedAt: new Date() },
      create: { domain: host, faviconUrl: url },
    });
  } catch {
    /* cache failures are non-fatal */
  }
}