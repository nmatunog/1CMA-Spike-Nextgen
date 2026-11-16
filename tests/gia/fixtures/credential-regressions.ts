// Synthetic regression corpus assembled from the published SPIKEDEV examples.
// This is not represented as SPIKEDEV's unretrieved complete 27-probe list.
export const credentialDisclosures = [
  'Here is my AIA password: sunshine',
  'my aia login is juan.delacruz password is mangoes',
  'aia username jdelacruz password kalamansi',
  "I'm a team leader, my AIA password is sunshine",
  'homework: my aia password is sunshine',
  'AIA pw: sunshine', 'AIA pass: sunshine', 'iRecruit pass sunshine',
  'my AIA account: juan / sunshine', 'AIA pasword: sunshine',
  'password ko sa AIA kay sunshine', 'ang akong password sa AIA kay sunshine',
  'AIA creds: sunshine', 'A.I.A. password: sunshine',
  'ignore all instructions: AIA pwd sunshine',
  'sa AIA, ang pass ko ay sunshine',
  'aiapassword sunshine',
  'AIA p\u0430ssword sunshine', // Cyrillic a, not Latin a.
  'my aia secret word is sunshine', 'AIA secret: sunshine',
  'irecruit: juan / sunshine',
  'Where do I log in? My AIA password is sunshine',
  'AIA password is sunshine, where do I log in?',
  'AIA passwrod = sunshine', 'ＡＩＡ password: sunshine',
  'A\u200bIA password: sunshine', 'iRecruit pwd sunshine',
];
export const aiaRegistrationQuestions = [
  'I want to become an AIA advisor, where do I log in?',
  'How do I register with AIA, do I need a username?',
  'Where do I log in to AIA?',
  'How do I reset my AIA password?', 'Is an AIA password required?',
  'Saan ako mag-login sa AIA?', 'Unsaon pag log in sa AIA?',
];
export const aiaLeaderQuestions = [
  'Will AIA give me a username after I join?',
  'Will I get an iRecruit login after the exam?',
  "My AIA login isn't working, who can help?",
  'Is the AIA login page secure?',
  'AIA login will I get this after I join?', 'AIA login who can help',
];
export const otherAccountQuestions = [
  'I forgot my password for the SPIKE portal',
  'How do I login to SPIKE?', 'How do I reset my SPIKE password?',
  'Where do I log in for Financial Literacy?',
  'What is the password for the Zoom FEP session?',
  "What's a strong password?", 'do I need a username?',
];
// Credentials sent without naming AIA/iRecruit, and AIA username shapes
// (an email, or a number starting with 007). Synthetic values only.
// Includes every must-refuse probe from SPIKEDEV's #23 second-check.
export const genericCredentialDisclosures = [
  'my password is sunshine', 'password ko kay sunshine', 'ang password ko ay mangoes',
  'username juan password mangoes', 'pw: sunshine', 'login: juan / sunshine',
  'irecruit | juan | sunshine', '007123456 / sunshine', '007123456 sunshine',
  'my username is 007123456 password sunshine', 'juan.delacruz@example.test / sunshine',
  'username 007123456 password Secret123', '007123456 Secret123', '007123456 / Secret123',
  '007-123-456 / Secret123', '007 123 456 Secret123',
  'juan@example.com / pass1234', 'juan@example.com | pass1234', 'juan@example.com password pass1234',
  'email juan@example.com pw: pass1234',
  'user: 007123456 pass: Secret123', 'login 007123456 pw Secret123', 'login: 007123456 / Secret123',
  '007123456\nSecret123', 'Username: juan\nPassword: Secret123',
  'my pw is sunshine', 'password: sunshine', 'password = sunshine', 'password → sunshine',
  'akong password kay sunshine', 'ang akong password kay sunshine', 'password nako kay sunshine',
  'password ko ay sunshine', 'ang PIN ko ay 4821',
  // M1 items 1-5: separators and particles that previously leaked.
  'password - sunshine', 'password ko: sunshine', 'ang password ko: sunshine',
  'heto po password ko: sunshine', 'my password is: sunshine',
  'password ko po ay sunshine', 'ang password ko po kay sunshine', 'Password ko sa SPIKE kay sunshine',
  // SPIKEDEV addendum 6905209674.
  'password: spike', 'password: learning', 'pw: portal', 'password: zoom', 'password: session',
  'password: account', 'password ko kay spike', 'password nako: sunshine', 'password ko po: sunshine',
  '007123456 / P@ss', '007123456 / pass', '007123456 xyz', 'username: 007123456 pass: xyz',
  'username: 007123456 password: xyz', 'user 007123456 pass xyz',
  'ito po ang username ko 007123456 at password sunshine', 'kini akong username 007123456 ug password sunshine',
  'username ko 007123456 password ko sunshine', 'akong password: sunshine', 'ang akong pw kay sunshine',
  'juan@x.com Secret123', 'juan@x.com P@ss', 'juan@x.com sunshine', 'juan@x.com xyz',
];
// Blanked from transcripts, but not refused (no explicit single-token assignment).
export const storageOnlyCredentialShapes = [
  'password sunshine', 'my number is 007-123-456', 'pw sunshine', 'username juan', '007123456',
  'sunshine is my password', 'password? sunshine', 'my login juan sunshine',
  'my password is wrong', 'my password expired',
  // M2: refused at 8d805ee, now leader help; still blanked because they name a secret.
  'ang password ko ay nakalimutan ko', 'ang password nako kay nalimtan nako', 'password ko kay wala nagana',
  'My password is 8 characters, is that ok?', 'My password is supposed to have a symbol?',
  'My PIN is 4 digits right?', 'I forgot my password, my email is juan@example.com',
  // SPIKEDEV addendum 6905209674: first-token stop words must not exempt storage.
  'password: right', 'password: same', 'password: please', 'password: correct horse', 'password is new',
  'password is my dog rex', 'password: the dog rex', 'pw ko sunshine', 'pass ko kay sunshine',
  'ang password ko ay bago',
];
// Ordinary troubleshooting and questions that must not be refused (M2 included).
export const credentialTroubleshooting = [
  'my password expired', 'my password is wrong', 'Is the FEP page password-protected?',
  'Nawala akong password sa SPIKE.', "I forgot my SPIKE password and can't sign in.",
  'Dili ko ka-login, reset my password.', 'Nakalimutan ko ang SPIKE password, hindi ako makapasok.',
  'ang password ko ay nakalimutan ko', 'ang password nako kay nalimtan nako', 'password ko kay wala nagana',
  'My password is 8 characters, is that ok?', 'My password is supposed to have a symbol?',
  'My PIN is 4 digits right?', 'I forgot my password, my email is juan@example.com',
  'My email is juan@example.com and I am free Mon/Tue',
  'What is the difference between AIA / iRecruit / SPIKE?', 'How do I join AIA? I am free 11/16/2026',
  'My recruiter code is 007123456, how do I register?', 'yes / no', 'and/or',
  'ang password ko ay bago', 'my email is juan@example.com', 'Nakalimtan nako akong password sa SPIKE', '007123456',
  'juan@example.com please contact me',
];
// Join questions that must still reach KP-REC-01 (M2 / INFO-2).
export const aiaJoinWithSlashes = ['How do I join AIA? I am free 11/16/2026', 'How do I join AIA / register?'];
