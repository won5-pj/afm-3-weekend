// ============================================================
// Footer — 레이아웃
// ============================================================
function Footer() {
  return (
    <footer className="bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-9 w-9 border-4 border-white bg-brutal-yellow text-black font-black">C</span>
          <span className="font-mono font-black uppercase">Claude · by Anthropic</span>
        </div>
        <p className="font-mono text-sm opacity-70 text-center sm:text-right">
          정직하고 · 무해하고 · 도움이 되는 AI 어시스턴트
        </p>
      </div>
    </footer>
  );
}
