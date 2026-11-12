export const domain = 'documents';
export const status = 'stub';
export const mvp = null;

const draft = (id, en) => ({
  id,
  domain,
  topic: 'documents',
  version: '0.1',
  owner: 'Nilo',
  status: 'draft',
  audience: 'staff_only',
  source: 'https://github.com/nmatunog/1CMA-Spike-Nextgen/issues/5',
  effective: '2026-11-04',
  reviewBy: '2026-12-04',
  answers: { en },
});

export const entries = [
  draft('KP-DOCS-01', 'DRAFT — iRecruit document checklist is not approved for GIA. Direct people to iRecruit or their leader. Do not collect files in chat.'),
  draft('KP-DOCS-02', 'DRAFT — IC exam application documents are not approved for GIA. A leader must confirm current requirements.'),
  draft('KP-DOCS-03', 'DRAFT — AIA agent coding forms are not approved for GIA and must not be described as a procedure.'),
  draft('KP-DOCS-04', 'DRAFT — Character-reference templates are not approved for GIA. Do not request references in chat.'),
  draft('KP-DOCS-05', 'DRAFT — Bank, TIN or SSS copies must never be collected in GIA. Submit only through iRecruit or the assigned leader.'),
  draft('KP-DOCS-06', 'DRAFT — License certificates are not handled by GIA. Do not upload images here.'),
];
