export const CARRIERS = ['parcelhawk', 'vela', 'northpost', 'quickfox', 'ironrail'];

export function isCarrier(id: string): boolean {
  return CARRIERS.includes(id);
}
