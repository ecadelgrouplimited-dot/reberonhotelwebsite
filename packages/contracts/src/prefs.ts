import { z } from 'zod';

/**
 * One person's House layout: which apps sit in the dock and on top of Home,
 * their order, what is hidden, and how the House looks for them. Stored on the
 * user, so it follows them to any device; cached on each device for offline use.
 */
const zHref = z.string().min(1).max(200).regex(/^\//, 'An app address starts with /');

export const zHousePrefs = z.object({
  /** Apps in the dock and the “Pinned” row on Home, in order. */
  pinned: z.array(zHref).max(14).optional(),
  /** Apps the person never wants to see on Home (still reachable by search). */
  hidden: z.array(zHref).max(80).optional(),
  /** Show the dock at the bottom of every screen. */
  dock: z.boolean().optional(),
  /** Bigger icons and text on Home. */
  largeIcons: z.boolean().optional(),
});
export type HousePrefs = z.infer<typeof zHousePrefs>;

/** Any stored value (missing, partial, old) as valid preferences. */
export function readHousePrefs(value: unknown): HousePrefs {
  const r = zHousePrefs.safeParse(value ?? {});
  return r.success ? r.data : {};
}
