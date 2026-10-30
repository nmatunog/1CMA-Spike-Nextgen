import { config } from './config.js';
import { audiences, invitations, validateCandidate, reflect, attribution, createMockAdapter, responseMessage } from './candidate.js';

const $ = selector => document.querySelector(selector);
let demoVisitor = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const readPreference = key => { try { return localStorage.getItem(key); } catch { return null; } };
const savePreference = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private browsing: session controls still work. */ } };
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  $('#theme').setAttribute('aria-pressed', String(theme === 'light'));
  updateBranding(theme);
}
function setArtwork(container, url, alt) {
  if (!url) { container.replaceChildren(document.createTextNode(alt)); return; }
  const image = document.createElement('img');
  image.src = url;
  image.alt = alt;
  image.className = 'brand-art';
  image.addEventListener('error', () => container.replaceChildren(document.createTextNode(alt)), { once: true });
  container.replaceChildren(image);
}
function updateBranding(theme) {
  setArtwork($('[data-logo="spike"]'), config.logos.spikeDark, 'SPIKE');
  if ($('[data-logo="cma"]')) setArtwork($('[data-logo="cma"]'), config.logos.cma, '1CMA');
  setArtwork($('[data-logo="versa"]'), config.logos.versa, 'Versa');
}
applyTheme(readPreference('spike-next-theme') === 'light' ? 'light' : 'dark');
$('#theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  savePreference('spike-next-theme', next);
});

// Native dialogs provide inert background, Escape and focus containment.
const returnFocus = new WeakMap();
function openDialog(dialog, trigger) {
  if (dialog.open) return;
  returnFocus.set(dialog, trigger || $('#watch'));
  dialog.showModal();
}
function closeDialog(dialog) { dialog.close(); }
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), input, select, video[controls], [tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first?.focus();
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.id === 'intro') $('#intro-video').pause();
    if (dialog.id === 'entry') resetEntry();
    if (dialog.id === 'intro' && $('#entry').open) return;
    if (dialog.id === 'signup') resetSignup();
    const trigger = returnFocus.get(dialog);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const box = dialog.getBoundingClientRect();
    if (dialog.id !== 'entry' && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) closeDialog(dialog);
  } });
}
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => closeDialog(document.getElementById(button.dataset.close)));
const video = $('#intro-video');
const videoReady = Boolean(config.intro.src && config.intro.captions);
if (videoReady) {
  video.src = config.intro.src;
  if (config.intro.poster) video.poster = config.intro.poster;
  const track = document.createElement('track');
  Object.assign(track, { kind: 'captions', srclang: 'en', label: 'English', src: config.intro.captions, default: true });
  video.append(track);
  video.hidden = false;
  $('#video-placeholder').hidden = true;
  $('#video-status').textContent = 'Video starts muted. Use the player controls for sound.';
  video.addEventListener('error', () => {
    $('#video-status').textContent = 'The video is unavailable. You can continue exploring below.';
    $('#video-placeholder').hidden = false;
    video.hidden = true;
  });
}
function showIntro(trigger) {
  openDialog($('#intro'), trigger);
  if (videoReady && !reducedMotion.matches) {
    video.muted = true;
    video.play().catch(() => { $('#video-status').textContent = 'Press Play to watch when you’re ready.'; });
  }
}
function openEntry() {
  if ($('#entry').open) return;
  if ($('#intro').open) closeDialog($('#intro'));
  openDialog($('#entry'), $('#watch'));
  if (demoVisitor) {
    $('#intro-name').value = demoVisitor.name;
    $('#intro-email').value = demoVisitor.email;
  }
  $('#intro-name').focus();
}
$('#intro-close').addEventListener('click', openEntry);
$('#intro-explore').addEventListener('click', openEntry);
$('#intro').addEventListener('cancel', event => { event.preventDefault(); openEntry(); });
$('#entry').addEventListener('cancel', event => { event.preventDefault(); });
video.addEventListener('ended', openEntry);
$('#watch').addEventListener('click', event => showIntro(event.currentTarget));
$('#watch-card').addEventListener('click', event => showIntro(event.currentTarget));
let entryGeneration = 0;
function resetEntry() {
  entryGeneration++;
  $('#intro-form').reset();
  $('#intro-submit').disabled = false;
  $('#intro-submit').textContent = 'Sign up & explore →';
  $('#intro-form').removeAttribute('aria-busy');
  for (const key of ['name', 'email', 'consent']) {
    $(`#intro-${key}-error`).textContent = '';
    $(`#intro-${key}`).removeAttribute('aria-invalid');
  }
  $('#intro-result').textContent = '';
}
$('#intro-form').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('#intro-submit').disabled) return;
  const payload = { name: $('#intro-name').value.trim(), email: $('#intro-email').value.trim(),
    consent: $('#intro-consent').checked, consentVersion: 'sprint-01-demo-only',
    invitation: 'preview', audience: 'professional', version: 1,
    attribution: attribution(location.search), diagnostic: null };
  const errors = validateCandidate(payload);
  for (const key of ['name', 'email', 'consent']) {
    $(`#intro-${key}-error`).textContent = errors[key] || '';
    $(`#intro-${key}`).setAttribute('aria-invalid', String(Boolean(errors[key])));
  }
  const first = Object.keys(errors)[0];
  if (first) { $(`#intro-${first}`).focus(); return; }
  const generation = ++entryGeneration;
  $('#intro-submit').disabled = true;
  $('#intro-submit').textContent = 'Confirming demo…';
  $('#intro-form').setAttribute('aria-busy', 'true');
  let result;
  try { result = await createMockAdapter({ scenario: config.mockScenario })(payload); }
  catch { result = { status: 'networkError', mode: 'mock' }; }
  if (generation !== entryGeneration || !$('#entry').open) return;
  const message = responseMessage(result);
  if (message.accepted) {
    demoVisitor = { name: payload.name, email: payload.email };
    savePreference('spike-next-skip-intro', 'true');
    $('#entry-status').textContent = 'Demo signup acknowledged. Explore the preview below; no portal account or application was created.';
    $('#entry-status').hidden = false;
    returnFocus.set($('#entry'), $('#main'));
    closeDialog($('#entry'));
    $('#main').focus({ preventScroll: true });
  } else {
    $('#intro-result').textContent = message.text;
    $('#intro-submit').disabled = false;
    $('#intro-submit').textContent = 'Sign up & explore →';
    $('#intro-form').removeAttribute('aria-busy');
  }
});
reducedMotion.addEventListener('change', event => { if (event.matches) video.pause(); });
// Runs once on this document load; no navigation, looping timers or page-blocking loader.
if (readPreference('spike-next-skip-intro') !== 'true') showIntro($('#watch'));
else openEntry();

const audienceCopy = {
  professional: ['Build on what you already know.', 'Explore how your professional experience could support a new learning and career direction, while asking practical questions about the transition.'],
  parent: ['Make space for your next chapter.', 'Explore learning and career possibilities alongside your family priorities. Ask about the time commitment and requirements before deciding.'],
  student: ['Turn curiosity into a direction.', 'Explore financial entrepreneurship as you prepare for life after school. Understand the learning pathway and eligibility before choosing your next step.'],
};
let audience = 'professional';
for (const button of document.querySelectorAll('[data-audience]')) button.addEventListener('click', () => {
  audience = button.dataset.audience;
  for (const option of document.querySelectorAll('[data-audience]')) option.setAttribute('aria-pressed', String(option === button));
  $('#audience-title').textContent = audienceCopy[audience][0];
  $('#audience-description').textContent = audienceCopy[audience][1];
});
let reflectionAnswers = null;
let reflectedInvitation = 'preview';
$('#reflection-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  reflectionAnswers = ['goal', 'interest', 'pace'].map(key => form.get(key));
  const result = reflect(reflectionAnswers);
  if (!result) return;
  reflectedInvitation = result.invitation;
  $('#reflection-result').textContent = `${result.tied ? 'Your interests span several paths. A preview may help you explore: ' : 'Based on all three preferences, consider: '}${invitations[result.invitation]}. This is an invitation suggestion, not a prediction of suitability or career success. You can choose any invitation.`;
  $('#reflection-signup').hidden = false;
});
$('#reflection-form').addEventListener('change', () => {
  reflectionAnswers = null;
  $('#reflection-result').textContent = '';
  $('#reflection-signup').hidden = true;
});

const signup = $('#signup');
let requestGeneration = 0;
let pending = false;
const fieldSelector = key => ({ audience: '#signup-audience', contactMode: '#contact-mode', document: '#supporting-document', businessGoal: '#business-goal', dateOfBirth: '#date-of-birth', civilStatus: '#civil-status', pathwayGender: '#pathway-gender', pathwayCivilStatus: '#pathway-civil-status' }[key] || `#${key}`);
function updateEnrollment() {
  const selected = $('#invitation').value;
  $('#preview-details').hidden = selected !== 'preview';
  $('#literacy-details').hidden = selected !== 'literacy';
  $('#pathway-details').hidden = selected !== 'pathway';
  $('#enrollment-title').textContent = `Enrollment details · ${invitations[selected]}`;
  // Do not retain a document selection when leaving pathway enrollment.
  if (selected !== 'pathway') $('#supporting-document').value = '';
}
$('#invitation').addEventListener('change', updateEnrollment);
function showStep(step) {
  $('#signup-step-one').hidden = step !== 1;
  $('#signup-step-two').hidden = step !== 2;
  $('#signup-progress').textContent = step === 1 ? 'Step 1 of 2 · Your invitation' : 'Step 2 of 2 · Fictional demo details';
  $(step === 1 ? '#invitation' : '#name').focus();
}
function clearErrors() {
  for (const key of ['name', 'email', 'invitation', 'audience', 'consent', 'mobile', 'contactMode', 'availability', 'topic', 'occupation', 'education', 'motivation', 'commitment', 'document', 'businessGoal', 'dateOfBirth', 'address', 'gender', 'civilStatus', 'pathwayGender', 'pathwayCivilStatus']) {
    $(`#${key}-error`).textContent = '';
    $(fieldSelector(key)).removeAttribute('aria-invalid');
  }
}
function resetSignup() {
  requestGeneration++;
  pending = false;
  $('#signup-form').reset();
  clearErrors();
  $('#signup-result').textContent = '';
  $('#signup-submit').disabled = false;
  $('#signup-submit').textContent = 'Submit demo enrollment ↗';
  $('#signup-form').removeAttribute('aria-busy');
  $('#signup-step-one').hidden = false;
  $('#signup-step-two').hidden = true;
  $('#signup-progress').textContent = 'Step 1 of 2 · Your invitation';
}
function showSignup(invitation, trigger) {
  resetSignup();
  $('#invitation').value = invitations[invitation] ? invitation : 'preview';
  $('#signup-audience').value = audience;
  if (demoVisitor) { $('#name').value = demoVisitor.name; $('#email').value = demoVisitor.email; }
  updateEnrollment();
  $('#mock-scenario').value = config.mockScenario;
  openDialog(signup, trigger);
  $('#invitation').focus();
}
for (const button of document.querySelectorAll('[data-signup]')) button.addEventListener('click', event => showSignup(button.dataset.signup, event.currentTarget));
$('#reflection-signup').addEventListener('click', event => showSignup(reflectedInvitation, event.currentTarget));
$('#signup-next').addEventListener('click', () => {
  if (invitations[$('#invitation').value] && audiences.includes($('#signup-audience').value)) showStep(2);
});
$('#signup-back').addEventListener('click', () => { if (!pending) showStep(1); });
$('#signup-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (pending) return;
  clearErrors();
  $('#signup-result').textContent = '';
  const payload = {
    version: 1,
    name: $('#name').value.trim(),
    email: $('#email').value.trim(),
    invitation: $('#invitation').value,
    audience: $('#signup-audience').value,
    consent: $('#consent').checked,
    consentVersion: 'sprint-01-demo-only',
    attribution: attribution(location.search),
    diagnostic: reflectionAnswers ? [...reflectionAnswers] : null,
    ...($('#invitation').value === 'literacy' ? { businessGoal: $('#business-goal').value.trim() } : {}),
    enrollment: {
      mobile: $('#mobile').value.trim(), contactMode: $('#contact-mode').value,
      availability: $('#availability').value.trim(),
      ...($('#invitation').value === 'preview' ? { gender: $('#gender').value, questions: $('#questions').value.trim() } : {}),
      ...($('#invitation').value === 'literacy' ? { civilStatus: $('#civil-status').value, topic: $('#topic').value, dateOfBirth: $('#date-of-birth').value, address: $('#address').value.trim() } : {}),
      ...($('#invitation').value === 'pathway' ? {
        formal: true, gender: $('#pathway-gender').value, civilStatus: $('#pathway-civil-status').value,
        occupation: $('#occupation').value.trim(), education: $('#education').value,
        motivation: $('#motivation').value.trim(), commitment: $('#commitment').value,
        document: $('#supporting-document').files[0] ? {
          provided: true, type: $('#supporting-document').files[0].type,
          size: $('#supporting-document').files[0].size,
        } : null,
      } : {}),
    },
  };
  const errors = validateCandidate(payload);
  const keys = Object.keys(errors);
  if (keys.length) {
    showStep(keys.some(key => ['audience', 'invitation'].includes(key)) ? 1 : 2);
    for (const key of keys) {
      $(`#${key}-error`).textContent = errors[key];
      $(fieldSelector(key)).setAttribute('aria-invalid', 'true');
    }
    $(fieldSelector(keys[0])).focus();
    return;
  }
  pending = true;
  const generation = ++requestGeneration;
  $('#signup-submit').disabled = true;
  $('#signup-submit').textContent = 'Waiting for demo response…';
  $('#signup-form').setAttribute('aria-busy', 'true');
  let result;
  try { result = await createMockAdapter({ scenario: $('#mock-scenario').value })(payload); }
  catch { result = { status: 'networkError', mode: 'mock' }; }
  // Ignore a response from a closed/reset dialog; never claim receipt on a stale response.
  if (generation !== requestGeneration || !signup.open) return;
  pending = false;
  $('#signup-submit').disabled = false;
  $('#signup-submit').textContent = 'Submit demo enrollment ↗';
  $('#signup-form').removeAttribute('aria-busy');
  const message = responseMessage(result);
  if (message.accepted) {
    $('#name').value = '';
    $('#email').value = '';
    $('#consent').checked = false;
    $('#supporting-document').value = '';
    $('#occupation').value = '';
    $('#motivation').value = '';
    $('#date-of-birth').value = '';
    $('#address').value = '';
    $('#mobile').value = '';
    $('#business-goal').value = '';
    $('#gender').value = '';
    $('#civil-status').value = '';
    $('#pathway-gender').value = '';
    $('#pathway-civil-status').value = '';
  }
  $('#signup-result').textContent = message.text;
  $('#signup-result').focus();
});
