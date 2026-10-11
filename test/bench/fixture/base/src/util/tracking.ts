export const PATTERNS: Record<string, RegExp> = {
  parcelhawk: /^PH\d{9}$/,
  vela: /^VL[A-Z0-9]{8}$/,
  northpost: /^NP\d{12}$/,
  quickfox: /^QF\d{8}$/,
  ironrail: /^IR[A-Z]{2}\d{6}$/,
};

/** Upper-cases, drops spaces and dashes, and returns null when the carrier would not accept it. */
export function normaliseTracking(carrier: string, raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[\s-]/g, '');
  const pattern = PATTERNS[carrier];
  return pattern !== undefined && pattern.test(cleaned) ? cleaned : null;
}
