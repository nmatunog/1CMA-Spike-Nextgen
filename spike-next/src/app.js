import { config } from './config.js';
import { audiences, invitations, validateCandidate, reflect, attribution, createMockAdapter, responseMessage } from './candidate.js';

const $ = selector => document.querySelector(selector);
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
  setArtwork($('[data-logo="spike"]'), theme === 'dark' ? config.logos.spikeDark : config.logos.spikeLight, 'SPIKE');
  setArtwork($('[data-logo="cma"]'), config.logos.cma, '1CMA');
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
    if (dialog.id === 'signup') resetSignup();
    const trigger = returnFocus.get(dialog);
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(dialog);
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
  $('#intro-description').textContent = 'Explore the SPIKE NEXT journey. You can skip the introduction and browse every invitation.';
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
$('#watch').addEventListener('click', event => showIntro(event.currentTarget));
$('#watch-card').addEventListener('click', event => showIntro(event.currentTarget));
$('#opt-out').addEventListener('click', () => {
  savePreference('spike-next-skip-intro', 'true');
  closeDialog($('#intro'));
});
reducedMotion.addEventListener('change', event => { if (event.matches) video.pause(); });
// Runs once on this document load; no navigation, looping timers or page-blocking loader.
if (readPreference('spike-next-skip-intro') !== 'true') showIntro($('#watch'));

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
function showStep(step) {
  $('#signup-step-one').hidden = step !== 1;
  $('#signup-step-two').hidden = step !== 2;
  $('#signup-progress').textContent = step === 1 ? 'Step 1 of 2 · Your invitation' : 'Step 2 of 2 · Fictional demo details';
  $(step === 1 ? '#invitation' : '#name').focus();
}
function clearErrors() {
  for (const key of ['name', 'email', 'invitation', 'audience', 'consent']) {
    $(`#${key}-error`).textContent = '';
    $(key === 'audience' ? '#signup-audience' : `#${key}`).removeAttribute('aria-invalid');
  }
}
function resetSignup() {
  requestGeneration++;
  pending = false;
  $('#signup-form').reset();
  clearErrors();
  $('#signup-result').textContent = '';
  $('#signup-submit').disabled = false;
  $('#signup-submit').textContent = 'Submit demo request ↗';
  $('#signup-form').removeAttribute('aria-busy');
  $('#signup-step-one').hidden = false;
  $('#signup-step-two').hidden = true;
  $('#signup-progress').textContent = 'Step 1 of 2 · Your invitation';
}
function showSignup(invitation, trigger) {
  resetSignup();
  $('#invitation').value = invitations[invitation] ? invitation : 'preview';
  $('#signup-audience').value = audience;
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
  };
  const errors = validateCandidate(payload);
  const keys = Object.keys(errors);
  if (keys.length) {
    showStep(keys.some(key => ['audience', 'invitation'].includes(key)) ? 1 : 2);
    for (const key of keys) {
      $(`#${key}-error`).textContent = errors[key];
      $(key === 'audience' ? '#signup-audience' : `#${key}`).setAttribute('aria-invalid', 'true');
    }
    $(keys[0] === 'audience' ? '#signup-audience' : `#${keys[0]}`).focus();
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
  $('#signup-submit').textContent = 'Submit demo request ↗';
  $('#signup-form').removeAttribute('aria-busy');
  const message = responseMessage(result);
  if (message.accepted) {
    $('#name').value = '';
    $('#email').value = '';
    $('#consent').checked = false;
  }
  $('#signup-result').textContent = message.text;
  $('#signup-result').focus();
});
