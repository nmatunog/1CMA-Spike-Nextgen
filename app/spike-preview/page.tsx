import localFont from 'next/font/local';
import { SpikePreviewLanding } from '@/components/spike-preview/SpikePreviewLanding';
import { readDefaultRecruiterRegistration } from '@/lib/gia/recruiter-registration';

export const dynamic = 'force-dynamic';

const inter = localFont({ src: './InterVariable.ttf', display: 'swap', variable: '--font-gia-landing', weight: '100 900' });

export const metadata = {
  title: 'SPIKE · 1CMA',
  description: 'Your 1CMA guide to growing into a financial entrepreneur.',
  robots: { index: false, follow: false },
};

export default function SpikePreviewPage() {
  return (
    <SpikePreviewLanding
      fontClass={inter.variable}
      defaultRecruiter={readDefaultRecruiterRegistration()}
    />
  );
}
