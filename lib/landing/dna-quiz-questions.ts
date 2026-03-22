export type QuizOption = { t: string; v: number };

export type QuizQuestion = { q: string; options: QuizOption[] };

export const DNA_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    q: "What's your ideal work-life vibe?",
    options: [
      { t: "9-to-5 stability.", v: 0 },
      { t: "Laptop lifestyle freedom.", v: 10 },
    ],
  },
  {
    q: "How do you view income?",
    options: [
      { t: "A fixed salary.", v: 0 },
      { t: "Unlimited earning based on value.", v: 10 },
    ],
  },
  {
    q: "What's your stance on Social Media?",
    options: [
      { t: "Scroll only.", v: 2 },
      { t: "Build a brand.", v: 10 },
    ],
  },
  {
    q: "A friend struggles with money. You...",
    options: [
      { t: "Sympathize.", v: 0 },
      { t: "Help map a plan.", v: 10 },
    ],
  },
  {
    q: "Which excites you more?",
    options: [
      { t: "Executing a plan.", v: 5 },
      { t: "Being the CEO.", v: 10 },
    ],
  },
  {
    q: "How do you handle 'No'?",
    options: [
      { t: "Discouraging.", v: 0 },
      { t: "Next Opportunity.", v: 10 },
    ],
  },
  {
    q: "Growth mindset is...",
    options: [
      { t: "Get a job, stay comfy.", v: 0 },
      { t: "Invest in my own skills.", v: 10 },
    ],
  },
  {
    q: "Success means...",
    options: [
      { t: "Professional safety.", v: 0 },
      { t: "Financial freedom.", v: 10 },
    ],
  },
  {
    q: "Public speaking/networking?",
    options: [
      { t: "Behind the scenes.", v: 5 },
      { t: "Ready to lead.", v: 10 },
    ],
  },
  {
    q: "Ready to test drive a career?",
    options: [
      { t: "Maybe later.", v: 2 },
      { t: "Build my legacy now.", v: 10 },
    ],
  },
];
