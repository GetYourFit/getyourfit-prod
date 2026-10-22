import type { Garment } from '../shared/outfit-board';

export function PhotoCredits({ items }: { items: Garment[] }) {
  return <p>Stand-in garment photographs: {items.map((garment, index) => <span key={garment.id}>{index > 0 && '; '}<a href={garment.source}>{garment.caption}</a> by {garment.author}, <a href={garment.licenseUrl}>{garment.license}</a></span>)}. Backgrounds cleaned and photographs resized; source licences apply. <a href="/example/provenance.json">Source records and image provenance</a>.</p>;
}
