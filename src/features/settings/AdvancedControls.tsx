export function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-card p-5">
      <header className="mb-5 flex gap-3">
        <span className="settings-card-icon grid size-10 place-items-center rounded-lg">
          {icon}
        </span>
        <div>
          <h2 className="font-bold text-white">{title}</h2>
          <p className="text-xs text-[#9296a1]">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-black/10 p-3">
      <small className="text-[#898d98]">{label}</small>
      <p className="mt-1 break-all text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
