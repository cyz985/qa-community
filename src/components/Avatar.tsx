interface AvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClass = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-16 w-16 text-xl',
};

/** 用户头像：无头像时用用户名首字符占位 */
export default function Avatar({ username, avatarUrl, size = 'md' }: AvatarProps) {
  const cls = `${sizeClass[size]} rounded-full flex items-center justify-center font-bold overflow-hidden bg-brand-100 text-brand-700`;
  if (avatarUrl) {
    return <img src={avatarUrl} alt={username} className={cls} />;
  }
  return <div className={cls}>{username.slice(0, 1).toUpperCase()}</div>;
}
