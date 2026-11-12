export const domain = 'documents';
export const status = 'active';
export const mvp = '01';

const IRECRUIT_LINE = 'When ready, upload them to iRecruit or give them to your leader. Requirements can change, so your leader will confirm before you submit.';

const approved = (id, en) => ({
  id,
  domain,
  topic: 'licensing_documents',
  version: '0.1',
  owner: 'Nilo',
  status: 'approved',
  approvedBy: 'Nilo',
  approvedOn: '2026-11-12',
  approvalRef: 'docs/gia/source/kp-docs-v0.1.md',
  audience: 'public',
  source: 'https://github.com/nmatunog/NEXO/issues/27#issuecomment-6621466060',
  effective: '2026-11-12',
  reviewBy: '2026-12-12',
  answers: { en: `${en} ${IRECRUIT_LINE}` },
});

export const entries = [
  approved('KP-DOCS-01', "Here's what to prepare: (1) your TIN and proof of it, (2) your SSS number and proof of it, (3) one valid government ID, (4) if you're working, proof of income tax filing, and (5) the names of 3 character references who aren't relatives. Ask me about any item for details."),
  approved('KP-DOCS-02', "You'll need to be registered with the BIR and have a TIN. As proof, you can use your TIN ID, a BIR Form 2316, or any form that shows your TIN with a BIR stamp."),
  approved('KP-DOCS-03', "You'll need to be registered with SSS and have an SSS number. As proof, take a screenshot of your static information page in the SSS mobile app."),
  approved('KP-DOCS-04', "You'll need one valid government-issued ID, such as a passport, driver's license, or PRC ID. If you're unsure whether your ID counts, your leader can check it for you."),
  approved('KP-DOCS-05', "If you're currently working, prepare proof of income tax filing stamped received by the BIR. That's usually Form 2316 from your employer, or Form 1701 if you file your own taxes."),
  approved('KP-DOCS-06', "Prepare the names of 3 character references who are not your relatives, such as a former supervisor, teacher, or colleague. Please don't send their details in this chat."),
];
