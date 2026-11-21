import { visitorSafeHref } from '@/lib/gia/visitor-hrefs';

export function GiaCitation({
  citation,
}: {
  citation: { id: string; version: string; source?: string | null };
}) {
  const label = 'Source';
  const href = visitorSafeHref(citation.source);
  if (!href) return null;
  return (
    <a href={href} rel="noopener noreferrer">
      {label}
    </a>
  );
}
