import { Inter } from 'next/font/google';
import { SpikePreviewLanding } from '@/components/spike-preview/SpikePreviewLanding';
import { readDefaultRecruiterRegistration } from '@/lib/gia/recruiter-registration';

export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'SPIKE × Versa visitor preview · 1CMA',
  description: 'SPIKE NEXT visitor preview with GIA, free Financial Literacy, and the free Financial Entrepreneurship Preview. Synthetic details only.',
  robots: { index: false, follow: false },
};

export default function SpikePreviewPage() {
  return (
    <SpikePreviewLanding
      fontClass={inter.className}
      defaultRecruiter={readDefaultRecruiterRegistration()}
    />
  );
}
