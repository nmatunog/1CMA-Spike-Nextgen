export const domain = 'recruitment';
export const status = 'active';
export const mvp = '01';

const PARTNER = 'https://www.aia.com.ph/en/financialadvisor/partner-with-the-best';
const JOIN = 'https://www.aia.com.ph/en/financialadvisor/join-us-now';

export const entries = [
  {
    id: 'KP-REC-01',
    domain,
    topic: 'recruitment',
    version: '0.2',
    owner: 'Nilo',
    status: 'approved',
    approvedBy: 'Nilo',
    approvedOn: '2026-11-13',
    approvalRef: 'https://github.com/nmatunog/1CMA-Spike-Nextgen/issues/7#issuecomment-6857451420',
    audience: 'public',
    source: 'https://github.com/nmatunog/NEXO/issues/32#issuecomment-6857443390',
    effective: '2026-11-13',
    reviewBy: '2026-12-13',
    answers: {
      en: `AIA advisor path only — not intern or free-learner paths. 1 Free Financial Literacy. 2 Free FEP. 3 Register with your assigned AIA recruiter so credit is kept; AIA's official process is the system of record. 4 SPIKE Venture Studio. Never send AIA login credentials. SPIKE does not submit or confirm AIA applications. Public: ${PARTNER} and ${JOIN}.`,
      ceb: `AIA advisor nga dalan lamang — dili intern o free-learner. 1 Libreng Financial Literacy. 2 Libreng FEP. 3 Magparehistro sa imong assigned nga AIA recruiter aron ma-keep ang credit; opisyal nga proseso sa AIA ang system of record. 4 SPIKE Venture Studio. Ayaw og send og AIA login. SPIKE dili mag-submit o mag-confirm og AIA application. Public: ${PARTNER} ug ${JOIN}.`,
      tl: `AIA advisor path lamang — hindi para sa intern o free learner. 1 Libreng Financial Literacy. 2 Libreng FEP. 3 Magparehistro sa assigned mong AIA recruiter para mapanatili ang credit; opisyal na proseso ng AIA ang system of record. 4 SPIKE Venture Studio. Huwag magpadala ng AIA login. Hindi nagsusumite o nagkukumpirma ang SPIKE ng AIA application. Public: ${PARTNER} at ${JOIN}.`,
    },
  },
  {
    id: 'KP-REC-02',
    domain,
    topic: 'recruitment',
    version: '0.1',
    owner: 'Nilo',
    status: 'approved',
    approvedBy: 'Nilo',
    approvedOn: '2026-11-13',
    approvalRef: 'https://github.com/nmatunog/1CMA-Spike-Nextgen/issues/7#issuecomment-6857451420',
    audience: 'public',
    source: 'https://github.com/nmatunog/NEXO/issues/32#issuecomment-6857443390',
    effective: '2026-11-13',
    reviewBy: '2026-12-13',
    answers: {
      en: 'No. AIA registration and paying for Level-Up are separate checks. Register only with your assigned AIA recruiter. Versa course access is a different entitlement. Level-Up is coming soon and not live. The AIA step applies only to the AIA advisor path, not to interns or free learners.',
      ceb: 'Dili. Lain ang AIA registration ug ang bayad sa Level-Up. Magparehistro lang sa imong assigned nga AIA recruiter. Lain usab ang Versa course access. Coming soon ang Level-Up, dili pa live. Ang AIA nga lakang para sa AIA advisor path, dili sa intern o free learner.',
      tl: 'Hindi. Magkaiba ang AIA registration at ang pagbayad para sa Level-Up. Magparehistro lang sa assigned mong AIA recruiter. Iba rin ang Versa course access. Coming soon ang Level-Up, hindi pa live. Ang AIA step ay para sa AIA advisor path, hindi sa intern o free learner.',
    },
  },
];
