import { staff } from '@/lib/gia/staff';
import CaptureForm from './form';

export const dynamic = 'force-dynamic';

export default async function CapturePage() {
  const actor = await staff();
  if (!actor) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Capture prospect</h1>
        <p>Authorized staff access required.</p>
        <a href="/login">Sign in</a>
      </main>
    );
  }
  if (actor.role !== 'admin') {
    return (
      <main style={{ padding: 24 }}>
        <h1>Capture prospect</h1>
        <p>Admin only. Leaders work assigned records in the Command Center.</p>
        <a href="/recruitment/command">Back to Command Center</a>
      </main>
    );
  }
  return <CaptureForm />;
}
