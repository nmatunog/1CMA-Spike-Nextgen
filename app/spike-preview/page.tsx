import { cookies, headers } from 'next/headers';
import { decodeVersaPreview, previewHost, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
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

export default async function SpikePreviewPage() {
  const host = (await headers()).get('host') ?? '';
  const preview = previewHost(host) ? decodeVersaPreview((await cookies()).get(VERSA_PREVIEW_COOKIE)?.value) : null;
  return (
    <SpikePreviewLanding
      fontClass={inter.variable}
      versaPreview={preview}
      defaultRecruiter={readDefaultRecruiterRegistration()}
    />
  );
}
