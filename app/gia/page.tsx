import { Inter } from 'next/font/google';
import { initialVisitorProgram } from '@/lib/gia/first-screen';
import { GiaChat } from '@/components/gia/GiaChat';
import { readDefaultRecruiterRegistration } from '@/lib/gia/recruiter-registration';

export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'GIA — Your 1CMA AI Guide',
  description: 'GIYA Institute — The SPIKE Method. Official AI guide across the SPIKE ecosystem.',
};

export default async function GiaPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const { program } = await searchParams;
  return (
    <div className={inter.className}>
      <GiaChat variant="page" initialProgram={initialVisitorProgram(program)} defaultRecruiter={readDefaultRecruiterRegistration()} />
    </div>
  );
}
