/**
 * Sanitizes user-facing media labels (captions and alts).
 * Filters out raw filenames, camera hashes, Pexels/Unsplash IDs, and UUIDs.
 */

export function isRawMediaIdentifier(text?: string | null): boolean {
  if (!text) return true;
  const s = text.trim();
  if (s.length === 0) return true;

  // UUID pattern (with hyphens or spaces)
  if (/^[0-9a-f]{8}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}[-\s][0-9a-f]{4}[-\s][0-9a-f]{12}$/i.test(s)) {
    return true;
  }

  // Stock photography markers
  if (/\b(pexels|unsplash|shutterstock|adobestock|getty|depositphotos|istock)\b/i.test(s)) {
    return true;
  }

  // Camera / device upload default patterns: IMG_1234, DSC_0012, DJI_001, etc.
  if (/^(img|dsc|dji|screenshot|asset|file|upload|screen|p_)[_-\s]?[0-9]+/i.test(s)) {
    return true;
  }

  // File extension endings
  if (/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(s)) {
    return true;
  }

  // String consisting predominantly of numbers or hex hashes (e.g. "724211268 40371849" or "9545914")
  const stripped = s.replace(/[^0-9]/g, '');
  if (stripped.length >= 6 && stripped.length / s.length > 0.45) {
    return true;
  }

  // Repeated hex-like chunks (e.g. "01a178e4 1d6b 726b 818d")
  if (/^[0-9a-f]{4,8}(\s+[0-9a-f]{4,8})+$/i.test(s)) {
    return true;
  }

  return false;
}

/**
 * Returns a clean, human-readable editorial caption or null if the label is a raw filename or hash.
 */
export function cleanMediaCaption(caption?: string | null, alt?: string | null): string | null {
  if (caption && !isRawMediaIdentifier(caption)) {
    return caption.trim();
  }
  if (alt && !isRawMediaIdentifier(alt)) {
    return alt.trim();
  }
  return null;
}
