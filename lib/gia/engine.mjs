// Pure, deterministic FAQ selection. No model, network access or transcript logging.
export const NOTICE = 'gia-pilot-2026-11-04';
export const welcome = "I'm GIA — Your 1CMA AI Guide, an AI assistant. Read the privacy notice before sharing information. We save a contact only with your consent. Type STOP to opt out. Please do not send IDs or documents.";
export const knowledge = [
  { id: 'KP-LIT-01', topic: 'literacy', version: '0.1', owner: 'Nilo', status: 'draft', audience: 'public', source: 'https://github.com/nmatunog/1CMA-Spike-Nextgen/issues/4', effective: '2026-11-04', reviewBy: '2026-12-04', answers: { en: 'Financial Literacy is free. You may start with learning or explore the free Financial Entrepreneurship Preview directly.', ceb: 'Libre ang Financial Literacy. Mahimo kang magsugod sa pagkat-on o modiretso sa libreng Financial Entrepreneurship Preview.', tl: 'Libre ang Financial Literacy. Maaari kang magsimula sa pag-aaral o dumiretso sa libreng Financial Entrepreneurship Preview.' } },
  { id: 'KP-FEP-01', topic: 'fep', version: '0.1', owner: 'Nilo', status: 'draft', audience: 'public', source: 'https://github.com/nmatunog/NEXO/issues/27', effective: '2026-11-04', reviewBy: '2026-12-04', answers: { en: 'The Financial Entrepreneurship Preview (FEP) is free. You can book directly without completing Financial Literacy. Choose an available session below.', ceb: 'Libre ang Financial Entrepreneurship Preview (FEP). Mahimo kang magpa-book bisan wala pa mahuman ang Financial Literacy. Pilia ang available nga sesyon sa ubos.', tl: 'Libre ang Financial Entrepreneurship Preview (FEP). Maaari kang mag-book kahit hindi pa tapos sa Financial Literacy. Pumili ng available na session sa ibaba.' } },
];
export function approved(entry, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return entry.status === 'approved' && entry.approvedBy === 'Nilo' && !!entry.approvedOn && entry.approvedOn <= day && ['public', 'candidate'].includes(entry.audience) && entry.effective <= day && entry.reviewBy >= day;
}
export function respond(text, language = 'en', pack = knowledge, now = new Date()) {
  const q = String(text).trim().toLowerCase();
  if (/\b(stop|unsubscribe|opt[ -]?out|ayoko na|hunong)\b/.test(q)) return { intent: 'opt_out', language, text: 'Your opt-out request will be saved before it is confirmed.' };
  const requested = /^(?:in )?(bisaya|cebuano|tagalog|english)( please)?[.!]?$/.test(q) || /\b(speak|use|switch|reply|respond|mag|paki)\b.*\b(bisaya|cebuano|tagalog|english)\b/.test(q);
  if (requested) {
    language = /bisaya|cebuano/.test(q) ? 'ceb' : /tagalog/.test(q) ? 'tl' : 'en';
    return { intent: 'language', language, text: language === 'ceb' ? 'Sige, mag-Bisaya ta. Unsa akong ikatabang?' : language === 'tl' ? 'Sige, mag-Tagalog tayo. Paano kita matutulungan?' : 'I will reply in English. How can I help?' };
  }
  if (/\b(document|passport|tin|sss|government id|photo of my id|upload|email my)\b/.test(q)) return { intent: 'request_leader', reason: 'documents', language, text: "Please don't send IDs or documents here. Upload them to iRecruit, or give them to your leader. Requirements can change; your leader will confirm before you submit." };
  if (/\b(status|my stage|my application)\b/.test(q)) return { intent: 'get_my_status', language, text: 'Your own status requires a verified code sent to your email or mobile. Verification is not connected in this pilot; please contact your leader.' };
  if (/\b(earn|income|salary|commission|guarantee|pass|eligible|refund|complaint|licen[sc]|exam|coding|agent code|distress|suicide|policy|insurance|internal|nexo|all candidates|someone else)\b/.test(q)) return { intent: 'request_leader', reason: 'restricted', language, text: 'I cannot verify or decide that. A 1CMA leader can help. Staff must use the Command Center for candidate records.' };
  if (/\b(leader|human|person)\b/.test(q)) return { intent: 'request_leader', reason: 'leader_requested', language, text: 'With your consent and contact, I can save a request for a 1CMA leader.' };
  // Exact FAQ variants prevent compound/restricted questions from borrowing a safe keyword.
  const clean = q.replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  const topic = ['financial literacy', 'literacy', 'what is financial literacy', 'tell me about financial literacy', 'join free financial literacy', 'is financial literacy free'].includes(clean) ? 'literacy' : ['fep', 'what is fep', 'is fep free', 'i am interested in fep', 'i want fep', 'explore free financial entrepreneurship preview', 'financial entrepreneurship preview'].includes(clean) ? 'fep' : null;
  const matches = pack.filter(e => e.topic === topic && approved(e, now));
  if (matches.length === 1) {
    const e = matches[0];
    if (e.answers[language]) return { intent: topic === 'fep' ? 'list_fep_sessions' : 'answer', language, text: e.answers[language], citation: { id: e.id, version: e.version, source: e.source } };
  }
  return { intent: 'request_leader', reason: 'unapproved_or_unknown', language, text: language === 'ceb' ? 'Wala pa koy aprobahan nga tubag niini. Mahimo kitang ikonektar sa usa ka 1CMA leader.' : language === 'tl' ? 'Wala pa akong aprubadong sagot dito. Maaari kitang ikonekta sa isang 1CMA leader.' : 'I do not have an approved answer for that yet. I can connect you with a 1CMA leader.' };
}
