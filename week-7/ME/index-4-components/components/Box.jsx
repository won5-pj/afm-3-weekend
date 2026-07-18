// ============================================================
// Box — 브루탈리즘 프리미티브
// 하드 섀도우 + 두꺼운 검정 테두리를 가진 기본 블록
// ============================================================
function Box({ as: Tag = 'div', color = 'bg-white', shadow = 'shadow-brutal', className = '', children, ...rest }) {
  return (
    <Tag
      className={`border-4 border-black ${color} ${shadow} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
