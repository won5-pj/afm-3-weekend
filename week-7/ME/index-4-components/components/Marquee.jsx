// ============================================================
// Marquee — 레이아웃
// 무한 스크롤 띠 (호버 시 정지, .marquee-track CSS 애니메이션)
// ============================================================
function Marquee({ items, color = 'bg-black', textColor = 'text-brutal-yellow' }) {
  const row = items.map((t, i) => (
    <span key={i} className="mx-6 font-mono font-black uppercase text-lg">★ {t}</span>
  ));
  return (
    <div className={`marquee-wrap overflow-hidden border-y-4 border-black ${color} ${textColor} py-3`}>
      <div className="marquee-track">
        {row}{row}
      </div>
    </div>
  );
}
