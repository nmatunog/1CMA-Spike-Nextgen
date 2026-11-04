import { staff } from '@/lib/gia/staff';
import Command from './panel';
export const dynamic = 'force-dynamic';
export default async function CommandPage() {
  const actor = await staff();
  if (!actor) return <main style={{ padding: 24 }}><h1>Recruitment Command Center</h1><p>Authorized staff access required.</p><a href='/login'>Sign in</a></main>;
  return <Command/>;
}
