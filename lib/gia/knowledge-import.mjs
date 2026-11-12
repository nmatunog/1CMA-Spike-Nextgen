// Knowledge Pack import keyed by (id, version). No model API. staff_only is never served.
const APPROVED_ID = /^(KP-LIT-|KP-FEP-|KP-DOCS-|KP-SAFETY-)/;
const REQUIRED = ['id', 'version', 'owner', 'status', 'audience', 'source', 'effective', 'reviewBy', 'answers'];
const APPROVAL_FIELDS = ['approvedBy', 'approvedOn', 'approvalRef'];
const WORD_LIMIT = 90;

export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function isStaffOnly(audience) {
  return /staff/.test(String(audience || '').toLowerCase().replace(/-/g, '_'));
}

export function validateEntry(entry) {
  const issues = [];
  if (!entry || typeof entry !== 'object') return ['not_an_object'];
  for (const key of REQUIRED) if (entry[key] == null || entry[key] === '') issues.push(`missing_${key}`);
  if (entry.id && !/^KP-[A-Z]+-\d+$/.test(entry.id)) issues.push('invalid_id');
  if (entry.version && !/^\d+(\.\d+)*$/.test(String(entry.version))) issues.push('invalid_version');
  if (entry.answers && (typeof entry.answers !== 'object' || Array.isArray(entry.answers) || !entry.answers.en)) issues.push('missing_en_answer');
  if (entry.answers && typeof entry.answers === 'object') {
    for (const [lang, text] of Object.entries(entry.answers)) {
      if (typeof text !== 'string' || !text.trim()) issues.push(`empty_answer_${lang}`);
      else if (wordCount(text) > WORD_LIMIT) issues.push(`answer_exceeds_${WORD_LIMIT}_words_${lang}`);
    }
  }
  if (entry.status === 'approved') {
    for (const key of APPROVAL_FIELDS) if (!entry[key]) issues.push(`missing_${key}`);
    if (entry.id && !APPROVED_ID.test(entry.id)) issues.push('only_lit_fep_docs_may_be_approved');
    if (entry.id?.startsWith('KP-DOCS-') && entry.topic && entry.topic !== 'licensing_documents') issues.push('docs_topic_must_be_licensing_documents');
    if (entry.id?.startsWith('KP-SAFETY-') && entry.topic && entry.topic !== 'safety') issues.push('safety_topic_must_be_safety');
    if (isStaffOnly(entry.audience)) issues.push('staff_only_cannot_be_approved_for_serving');
  }
  return issues;
}

export function isApproved(entry, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return !!entry
    && entry.status === 'approved'
    && entry.approvedBy === 'Nilo'
    && !!entry.approvedOn
    && entry.approvedOn <= day
    && ['public', 'candidate'].includes(entry.audience)
    && !isStaffOnly(entry.audience)
    && entry.effective <= day
    && entry.reviewBy >= day
    && APPROVED_ID.test(entry.id)
    && (!entry.id.startsWith('KP-DOCS-') || entry.topic === 'licensing_documents')
    && (!entry.id.startsWith('KP-SAFETY-') || entry.topic === 'safety')
    && validateEntry(entry).length === 0;
}

export function importKnowledge(entries) {
  if (!Array.isArray(entries)) throw new Error('knowledge_pack_not_array');
  const byKey = new Map();
  const issues = [];
  for (const [index, entry] of entries.entries()) {
    const entryIssues = validateEntry(entry);
    if (entryIssues.length) issues.push({ index, id: entry?.id, version: entry?.version, entryIssues });
    const key = `${entry?.id}::${entry?.version}`;
    if (byKey.has(key)) issues.push({ index, id: entry?.id, version: entry?.version, entryIssues: ['duplicate_id_version'] });
    else byKey.set(key, entry);
  }
  if (issues.length) {
    const error = new Error('knowledge_pack_invalid');
    error.issues = issues;
    throw error;
  }
  return { byKey, entries: [...byKey.values()] };
}

export function servedAnswers(pack, now = new Date()) {
  return pack.filter(entry => isApproved(entry, now) && !isStaffOnly(entry.audience));
}
