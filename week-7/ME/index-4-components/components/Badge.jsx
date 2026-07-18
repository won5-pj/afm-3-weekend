// ============================================================
// Badge — 브루탈리즘 프리미티브
// 라벨 배지 (약간 기울어짐 옵션은 className 으로 전달)
// ============================================================
function Badge({ color = 'bg-brutal-green', className = '', children }) {
  return (
    <span className={`inline-block border-4 border-black ${color} px-3 py-1 font-mono font-black uppercase text-sm shadow-brutal-sm ${className}`}>
      {children}
    </span>
  );
}
