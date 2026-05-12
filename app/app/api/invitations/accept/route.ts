import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: 'Token manquant.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  // Look up invitation using admin client (bypasses RLS for invitations table)
  const admin = await createAdminClient();
  const { data: invitation } = await admin
    .from('invitations')
    .select('*')
    .eq('token', token)
    .eq('accepted', false)
    .single();

  if (!invitation) {
    return NextResponse.json({ error: 'Invitation invalide ou déjà utilisée.' }, { status: 404 });
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invitation expirée.' }, { status: 410 });
  }

  // Add user to account_members
  const { error: memberError } = await admin
    .from('account_members')
    .upsert({
      account_id: invitation.account_id,
      user_id: user.id,
      role: invitation.role ?? 'member',
    });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  // Mark invitation as accepted
  await admin
    .from('invitations')
    .update({ accepted: true, accepted_at: new Date().toISOString() })
    .eq('id', invitation.id);

  return NextResponse.json({ ok: true });
}
