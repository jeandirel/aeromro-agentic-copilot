import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Small deterministic hash, used for stable jitter in dot plots. */
export function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Round up to a "nice" axis maximum (multiple of 25). */
export function niceMax(value: number, step = 25): number {
  return Math.max(step, Math.ceil(value / step) * step);
}

/** Session storage helpers that never throw (private windows, disabled storage). */
export const sessionStore = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown): void {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or disabled storage: keep in memory only */
    }
  },
  remove(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
