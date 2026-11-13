import { visitorSafeHref } from '@/lib/gia/visitor-hrefs';

export function GiaCitation({
  citation,
}: {
  citation: { id: string; version: string; source?: string | null };
}) {
  const label = `${citation.id} · v${citation.version}`;
  const href = visitorSafeHref(citation.source);
  if (!href) return <span>{label}</span>;
  return (
    <a href={href} rel="noopener noreferrer">
      {label}
    </a>
  );
}
