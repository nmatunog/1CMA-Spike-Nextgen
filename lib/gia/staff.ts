import { auth } from '@/auth';
import { staffRole } from './access.mjs';
export async function staff() {
  // Refuse the pre-existing build placeholder secret, including when auth.ts sets it.
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32 || /placeholder|dev-only/.test(secret)) return null;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || session?.user?.id !== `staff:${email}`) return null;
  const role = staffRole(email, process.env.RECRUITMENT_STAFF_ROLES);
  return role && email ? { email, role } : null;
}
