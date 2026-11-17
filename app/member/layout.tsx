import localFont from 'next/font/local';
import { SpikePreviewLanding } from '@/components/spike-preview/SpikePreviewLanding';
import { readDefaultRecruiterRegistration } from '@/lib/gia/recruiter-registration';
const inter = localFont({ src: '../spike-preview/InterVariable.ttf', display: 'swap', variable: '--font-gia-landing', weight: '100 900' });
export const dynamic = 'force-dynamic';
export const metadata = { title: 'SPIKE member account', robots: { index: false, follow: false } };
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <SpikePreviewLanding fontClass={inter.variable} defaultRecruiter={readDefaultRecruiterRegistration()}>{children}</SpikePreviewLanding>;
}
