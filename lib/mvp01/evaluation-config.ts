/** Active MVP 01 evaluation form. Sections/fields come from this config, not from UI hard-coding. */
export const MVP01_EVALUATION_CONFIG = {
  id: 'mvp01-recruitment',
  version: 1,
  title: 'MVP 01 recruitment evaluation',
  sections: [
    {
      id: 'background',
      title: 'Background',
      fields: [
        { id: 'background', label: 'Background', type: 'textarea', required: true, maxLength: 1000 },
      ],
    },
    {
      id: 'education',
      title: 'Education',
      fields: [
        { id: 'education', label: 'Education', type: 'textarea', required: true, maxLength: 1000 },
      ],
    },
    {
      id: 'motivation',
      title: 'Career interests / motivation',
      fields: [
        { id: 'motivation', label: 'Career interests / motivation', type: 'textarea', required: true, maxLength: 1000 },
      ],
    },
    {
      id: 'program',
      title: 'Program interest',
      fields: [
        {
          id: 'program_interest',
          label: 'Program interest',
          type: 'select',
          required: true,
          options: [
            { value: 'literacy', label: 'Financial Literacy (free)' },
            { value: 'fep', label: 'FEP (free)' },
            { value: 'ra_spike', label: 'RA-SPIKE' },
            { value: 'intern', label: 'SPIKE for Interns' },
            { value: 'undecided', label: 'Undecided' },
          ],
        },
      ],
    },
    {
      id: 'readiness',
      title: 'Availability / readiness',
      fields: [
        { id: 'readiness', label: 'Availability / readiness', type: 'textarea', required: true, maxLength: 500 },
      ],
    },
    {
      id: 'interview',
      title: 'Interview observations',
      fields: [
        { id: 'observations', label: 'Interview observations', type: 'textarea', required: false, maxLength: 1000 },
      ],
    },
    {
      id: 'decision',
      title: 'Human outcome',
      fields: [
        {
          id: 'outcome',
          label: 'Outcome',
          type: 'select',
          required: true,
          options: [
            { value: 'proceed', label: 'Proceed' },
            { value: 'hold', label: 'Hold' },
            { value: 'not_now', label: 'Not now' },
            { value: 'disqualified', label: 'Disqualified' },
          ],
        },
        {
          id: 'recommended_next_action',
          label: 'Recommended next action',
          type: 'select',
          required: true,
          options: [
            { value: 'fep', label: 'Book / attend FEP' },
            { value: 'literacy', label: 'Financial Literacy' },
            { value: 'leader_conversation', label: 'Leader conversation' },
            { value: 'follow_up', label: 'Follow-up' },
          ],
        },
      ],
    },
  ],
} as const;

export type EvaluationFormConfig = {
  id: string;
  version: number;
  title: string;
  sections: {
    id: string;
    title: string;
    fields: {
      id: string;
      label: string;
      type: 'text' | 'textarea' | 'select';
      required: boolean;
      maxLength?: number;
      options?: { value: string; label: string }[];
    }[];
  }[];
};

export function flattenEvaluationFields(config: EvaluationFormConfig) {
  return config.sections.flatMap((section) => section.fields);
}
