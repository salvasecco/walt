import type { LandingCopy } from "@/lib/landing/copy.es";

export function Comparison({ copy }: { copy: LandingCopy["comparison"] }) {
  return (
    <section id="alternativa" className="wl-dark wl-section">
      <div className="wl-container">
        <p className="wl-kicker">{copy.kicker}</p>
        <h2 className="wl-h2 mt-4 max-w-[22ch]">{copy.title}</h2>
        {/* En el celular, una tarjeta por fila; en pantallas anchas, la tabla. */}
        <div className="mt-10 space-y-4 md:hidden">
          {copy.rows.map((row) => (
            <div key={row.label} className="wl-card p-5">
              <p className="font-semibold">{row.label}</p>
              <dl className="mt-3 space-y-2 text-[0.95rem]">
                {row.cells.map((cell, i) => (
                  <div key={copy.columns[i]} className={i === 2 ? "rounded-xl bg-[rgb(43_217_124/0.1)] p-3" : ""}>
                    <dt className="text-xs text-(--wl-muted)">{copy.columns[i]}</dt>
                    <dd>{cell}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <div className="mt-10 hidden md:block">
          <table className="wl-compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Tema</span>
                </th>
                {copy.columns.map((c, i) => (
                  <th key={c} scope="col" className={i === 2 ? "wl-walt" : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {copy.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="font-semibold">
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={copy.columns[i]} className={i === 2 ? "wl-walt" : "text-(--wl-muted)"}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
