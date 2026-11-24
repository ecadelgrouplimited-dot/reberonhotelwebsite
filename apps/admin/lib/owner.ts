'use client';
/**
 * Whose House this device is showing right now. Recents, app-usage learning and the
 * back-trail live on the device; on a shared terminal each person must only ever
 * see their own, so those keys carry the signed-in person's id.
 */
let owner = '';

export function setStorageOwner(id: string) {
  if (id === owner) return;
  owner = id;
  // Older builds kept one unnamed copy per device: hand it to the first person seen, once.
  try {
    for (const base of ['rb-recents', 'rb-usage']) {
      const legacy = localStorage.getItem(base);
      if (legacy !== null) {
        if (localStorage.getItem(`${base}:${id}`) === null) localStorage.setItem(`${base}:${id}`, legacy);
        localStorage.removeItem(base);
      }
    }
  } catch {
    /* private mode */
  }
}

/** A storage key that belongs to the signed-in person. */
export const ownKey = (base: string) => (owner ? `${base}:${owner}` : `${base}:anon`);
