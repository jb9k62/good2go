export const MAX_PAGE = 50;

export function page<T>(items: T[], pageNumber = 1, size = 20): T[] {
  const n = Math.min(Math.max(1, Math.floor(size)), MAX_PAGE);
  const start = (Math.max(1, Math.floor(pageNumber)) - 1) * n;
  return items.slice(start, start + n);
}
