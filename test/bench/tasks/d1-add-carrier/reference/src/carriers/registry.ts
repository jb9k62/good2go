export const CARRIERS = ['parcelhawk', 'vela', 'northpost', 'quickfox', 'ironrail', 'zephyr'];

export function isCarrier(id: string): boolean {
  return CARRIERS.includes(id);
}
