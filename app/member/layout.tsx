import { cookies, headers } from 'next/headers';
import { decodeVersaPreview, previewHost, VERSA_PREVIEW_COOKIE } from '@/lib/member/versa-preview';
import localFont from 'next/font/local';
import { SpikePreviewLanding } from '@/components/spike-preview/SpikePreviewLanding';
import { readDefaultRecruiterRegistration } from '@/lib/gia/recruiter-registration';
const inter = localFont({ src: '../spike-preview/InterVariable.ttf', display: 'swap', variable: '--font-gia-landing', weight: '100 900' });
export const dynamic = 'force-dynamic';
export const metadata = { title: 'SPIKE member account', robots: { index: false, follow: false } };
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get('host') ?? '';
  const preview = previewHost(host) ? decodeVersaPreview((await cookies()).get(VERSA_PREVIEW_COOKIE)?.value) : null;
  return <SpikePreviewLanding versaPreview={preview} fontClass={inter.variable} defaultRecruiter={readDefaultRecruiterRegistration()}>{children}</SpikePreviewLanding>;
}
