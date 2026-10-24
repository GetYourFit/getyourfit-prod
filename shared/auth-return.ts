const destinations = ['/wardrobe', '/wardrobe#outfit', '/wardrobe#build-plan', '/account', '/plan'];

export function safeReturnPath(value: string | null): string {
  return value !== null && destinations.includes(value) ? value : '/wardrobe';
}

export function intendedPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  const destination = next === null ? window.location.pathname : next;
  return safeReturnPath(`${destination}${destination.includes('#') ? '' : window.location.hash}`);
}

export function accountEntry(path: '/sign-in' | '/sign-up', destination: string): string {
  return `${path}?next=${encodeURIComponent(safeReturnPath(destination))}`;
}
