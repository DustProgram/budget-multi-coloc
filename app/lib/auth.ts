import { createClient } from './supabase/server';
import { redirect } from 'next/navigation';

export async function getUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

export async function getUserProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export async function getActiveSpace(userId: string, kind: 'perso' | 'pro' = 'perso') {
  const supabase = await createClient();
  const { data } = await supabase
    .from('spaces')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', kind)
    .single();
  return data;
}

export async function getAccountsForSpace(spaceId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('accounts')
    .select(`
      *,
      account_members(user_id, role, users(id, name, color, initial))
    `)
    .eq('space_id', spaceId);
  return data ?? [];
}

export async function getJointAccounts(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('account_members')
    .select(`
      role,
      accounts(
        *,
        account_members(user_id, role, users(id, name, color, initial))
      )
    `)
    .eq('user_id', userId);
  return data ?? [];
}
