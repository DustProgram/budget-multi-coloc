import type { User } from '@/lib/types';

interface AvatarProps {
  user: User;
  size?: number;
}

export function Avatar({ user, size = 30 }: AvatarProps) {
  const fontSize = Math.round(size * 0.42);
  return (
    <div
      className={`avatar avatar-${user.color}`}
      style={{ width: size, height: size, fontSize }}
      title={user.name}
    >
      {user.initial}
    </div>
  );
}

interface AvatarStackProps {
  ids: number[];
  users: User[];
  size?: number;
}

export function AvatarStack({ ids, users, size = 22 }: AvatarStackProps) {
  const members = ids.map(id => users.find(u => u.id === id)).filter(Boolean) as User[];
  return (
    <div className="inline-flex items-center">
      {members.map((u, i) => (
        <div
          key={u.id}
          className={`avatar avatar-${u.color}`}
          style={{
            width: size,
            height: size,
            fontSize: Math.round(size * 0.42),
            marginLeft: i === 0 ? 0 : -size * 0.35,
            zIndex: members.length - i,
            border: '2px solid var(--bg-elev)',
            boxSizing: 'content-box',
          }}
          title={u.name}
        >
          {u.initial}
        </div>
      ))}
    </div>
  );
}
