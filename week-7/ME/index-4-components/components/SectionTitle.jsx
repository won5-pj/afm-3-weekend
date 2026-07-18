// ============================================================
// SectionTitle — 브루탈리즘 프리미티브
// 큼직한 대문자 제목 + 색 블록 kicker 배지 강조
// 의존: Badge
// ============================================================
function SectionTitle({ kicker, title, color = 'bg-brutal-blue', textColor = 'text-white' }) {
  return (
    <div className="mb-10">
      <Badge color={color} className={`${textColor} -rotate-2`}>{kicker}</Badge>
      <h2 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-black uppercase leading-none tracking-tight">
        {title}
      </h2>
    </div>
  );
}
