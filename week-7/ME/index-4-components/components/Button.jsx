// ============================================================
// Button — 브루탈리즘 프리미티브
// 호버 시 그림자가 사라지며 눌리는 버튼 (.press)
// ============================================================
function Button({ color = 'bg-brutal-yellow', size = 'md', className = '', children, ...rest }) {
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };
  return (
    <button
      className={`press inline-flex items-center justify-center gap-2 font-mono font-black uppercase tracking-wide
                  border-4 border-black shadow-brutal-sm ${color} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
