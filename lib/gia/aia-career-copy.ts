export const AIA_SOURCE_AS_OF = '14 November 2026';
export const AIA_REF_PARTNER = 'https://www.aia.com.ph/en/financialadvisor/partner-with-the-best';
export const AIA_REF_JOIN = 'https://www.aia.com.ph/en/financialadvisor/join-us-now';

export const AIA_CAREER_SECTIONS = [
  {
    id: 'why',
    title: 'Why this career',
    sourceUrl: AIA_REF_PARTNER,
    sourceLabel: 'AIA Philippines public overview (reference)',
    body: 'AIA Philippines is part of AIA, a pan-Asian life insurer, and was formerly Philam Life. Public copy describes Life Planners as licensed professionals who help people protect what matters and plan ahead through meaningful conversations. SPIKE does not enroll you or confirm a license.',
    sensitive: 'Public pages disagree on how many years AIA Philippines has been in market (70 vs 80). We do not quote a year count.',
  },
  {
    id: 'support',
    title: 'What support you get',
    sourceUrl: AIA_REF_JOIN,
    sourceLabel: 'AIA Philippines FAQs (reference)',
    body: 'AIA’s public FAQ says new Life Planners receive training, guidance, and mentorship from recruitment officers, the sales team, and their leader through licensing. Sales experience is not required. Skills are learned on the job. Program names and extras can change.',
    sensitive: 'Named recruitment programs and any allowance or travel terms are date-sensitive. GIA does not quote pay.',
  },
  {
    id: 'path',
    title: 'What the path looks like',
    sourceUrl: AIA_REF_JOIN,
    sourceLabel: 'AIA Philippines FAQs (reference)',
    body: 'AIA describes a Life Planner path that can later include unit leadership and building a team. On SPIKE the AIA advisor journey is: free Financial Literacy, free FEP, register with your recruiter so credit is kept, then SPIKE Venture Studio. AIA’s official process is the system of record.',
    sensitive: null,
  },
  {
    id: 'faq',
    title: 'FAQs',
    sourceUrl: AIA_REF_JOIN,
    sourceLabel: 'AIA Philippines FAQs (reference)',
    body: 'You can explore while keeping another job at first. Hours are not a fixed 9-to-5. Work can be in person, at home, or digital; office time is mainly for training or meetings. People join from many backgrounds, including fresh graduates and returning OFWs. Licensing is required.',
    sensitive: 'AIA FAQs also discuss commissions, bonuses, and trips. Those are not restated here as figures or guarantees.',
  },
] as const;
