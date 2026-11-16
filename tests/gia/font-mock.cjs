// Offline build verification only; substitutes a local font for the existing remote font.
module.exports = {
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap': "@font-face { font-family: 'Plus Jakarta Sans'; src: local('Arial'); font-weight: 200 800; font-style: normal; }",
  'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap': "@font-face { font-family: 'Inter'; src: local('Arial'); font-weight: 100 900; font-style: normal; }",
};
