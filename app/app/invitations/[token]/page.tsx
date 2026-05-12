import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import InvitationClient from './InvitationClient';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();

  // Look up invitation
  const { data: invitation } = await supabase
    .from('invitations')
    .select(`
      *,
      accounts(name, space_id, spaces(name))
    `)
    .eq('token', token)
    .eq('accepted', false)
    .single();

  if (!invitation) {
    redirect('/login?error=invitation_invalid');
  }

  // Check expiry
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    redirect('/login?error=invitation_expired');
  }

  const user = await getUser();

  return (
    <InvitationClient
      token={token}
      invitation={invitation}
      isAuthenticated={!!user}
    />
  );
}
