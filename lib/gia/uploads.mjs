// Chat uploads are discarded. Documents go only to iRecruit or the person's leader.
export const DOCUMENT_HANDOFF = "Please don't send IDs or documents here. Upload them to iRecruit, or give them to your leader. Requirements can change; your leader will confirm before you submit.";

export function looksLikeUploadPayload(body, contentType = '') {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('multipart/form-data') || ct.includes('application/octet-stream') || ct.includes('image/') || ct.includes('application/pdf')) return true;
  if (!body || typeof body !== 'object') return false;
  return ['file', 'files', 'upload', 'uploads', 'document', 'documents', 'attachment', 'attachments', 'binary'].some(key => key in body && body[key] != null);
}

export function discardedUploadResponse() {
  return {
    discarded: true,
    intent: 'request_leader',
    reason: 'documents',
    text: DOCUMENT_HANDOFF,
  };
}
