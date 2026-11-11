// Modular GIA knowledge domains. MVP 01 (Nov 16–20) activates recruitment
// orientation plus free Financial Literacy and free FEP. Other domains are
// stubbed and must not be served.
export const DOMAINS = Object.freeze({
  recruitment: Object.freeze({ id: 'recruitment', status: 'active', mvp: '01' }),
  'financial-literacy': Object.freeze({ id: 'financial-literacy', status: 'active', mvp: '01', topic: 'literacy' }),
  fep: Object.freeze({ id: 'fep', status: 'active', mvp: '01', topic: 'fep' }),
  interns: Object.freeze({ id: 'interns', status: 'stub', mvp: null }),
  'ra-spike': Object.freeze({ id: 'ra-spike', status: 'stub', mvp: null }),
  documents: Object.freeze({ id: 'documents', status: 'stub', mvp: null }),
});

export const MVP01_ACTIVE_DOMAINS = Object.freeze(
  Object.values(DOMAINS).filter(d => d.status === 'active' && d.mvp === '01').map(d => d.id),
);

export function topicDomain(topic) {
  if (topic === 'literacy') return 'financial-literacy';
  if (topic === 'fep') return 'fep';
  if (topic === 'interns') return 'interns';
  if (topic === 'ra-spike') return 'ra-spike';
  if (topic === 'documents') return 'documents';
  if (topic === 'recruitment') return 'recruitment';
  return null;
}

export function isActiveDomain(domain) {
  return MVP01_ACTIVE_DOMAINS.includes(domain);
}

export function isServableEntry(entry) {
  const domain = entry?.domain || topicDomain(entry?.topic);
  return isActiveDomain(domain);
}
