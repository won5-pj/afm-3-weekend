// ============================================================
// Header — 레이아웃
// 스티키 상단바 + 데스크톱 내비 + 모바일 햄버거 토글
// ============================================================
function Header() {
  const { useState } = React;

  const links = [
    { href: '#can-do', label: '할 수 있는 일' },
    { href: '#models', label: '모델' },
    { href: '#where',  label: '사용처' },
    { href: '#values', label: '지향점' },
  ];
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b-4 border-black bg-brutal-yellow">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-3">
          <span className="grid place-items-center h-10 w-10 border-4 border-black bg-black text-brutal-yellow font-black text-xl">C</span>
          <span className="font-mono font-black text-xl tracking-tight uppercase">Claude</span>
        </a>

        {/* 데스크톱 내비 */}
        <nav className="hidden md:flex items-center gap-2">
          {links.map(l => (
            <a key={l.href} href={l.href}
               className="press border-4 border-black bg-white shadow-brutal-sm px-4 py-2 font-mono font-bold text-sm uppercase">
              {l.label}
            </a>
          ))}
        </nav>

        {/* 모바일 토글 */}
        <button
          className="md:hidden press border-4 border-black bg-white shadow-brutal-sm px-4 py-2 font-mono font-black uppercase"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label="메뉴 열기">
          {open ? '✕' : '☰'}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t-4 border-black bg-white px-4 py-3 flex flex-col gap-2">
          {links.map(l => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}
               className="border-4 border-black bg-brutal-cream px-4 py-3 font-mono font-bold uppercase">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
