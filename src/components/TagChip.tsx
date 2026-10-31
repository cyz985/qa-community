interface TagChipProps {
  tag: string;
  active?: boolean;
  onClick?: (tag: string) => void;
}

/** 标签小徽章，可点击用于首页筛选 */
export default function TagChip({ tag, active, onClick }: TagChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(tag)}
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs transition ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
      }`}
    >
      {tag}
    </button>
  );
}
