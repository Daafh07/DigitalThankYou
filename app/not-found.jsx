export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold text-blue-700/70">404</p>
      <h1
        className="mt-3 text-2xl font-bold text-slate-900"
        style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
      >
        Pagina niet gevonden
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        De pagina die je zoekt bestaat niet (meer).
      </p>
      <a
        href="/"
        className="mt-6 inline-flex items-center justify-center rounded-full bg-[#1f4fc9] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a45b4]"
      >
        Naar home
      </a>
    </div>
  );
}

