interface AvatarUser {
  display_name?: string | null;
  ha_username?: string;
  color_hex?: string | null;
}

function initial(u: AvatarUser): string {
  const name = u.display_name || u.ha_username || '?';
  return name.charAt(0).toUpperCase();
}

function colorClass(hex?: string | null): string {
  // Maps hex/named to one of the 3 design palette tones based on hue
  if (!hex) return 'terra';
  const lower = hex.toLowerCase();
  if (lower.includes('sage') || lower.includes('green') || lower.startsWith('#3b8') || lower.startsWith('#10b') || lower.startsWith('#22c')) return 'sage';
  if (lower.includes('plum') || lower.includes('purple') || lower.startsWith('#8b5') || lower.startsWith('#a8')) return 'plum';
  return 'terra';
}

export function Avatar({ user, size = 30 }: { user: AvatarUser; size?: number }) {
  const fontSize = Math.round(size * 0.42);
  return (
    <span
      className={`avatar ${colorClass(user.color_hex)}`}
      style={{ width: size, height: size, fontSize }}
      title={user.display_name || user.ha_username || ''}
    >
      {initial(user)}
    </span>
  );
}

export function AvatarStack({ users, size = 22 }: { users: AvatarUser[]; size?: number }) {
  return (
    <span className="avatar-stack">
      {users.map((u, i) => (
        <span
          key={i}
          className={`avatar ${colorClass(u.color_hex)}`}
          style={{
            width: size, height: size,
            fontSize: Math.round(size * 0.42),
            marginLeft: i === 0 ? 0 : -size * 0.35,
            zIndex: users.length - i,
          }}
          title={u.display_name || u.ha_username || ''}
        >
          {initial(u)}
        </span>
      ))}
    </span>
  );
}
