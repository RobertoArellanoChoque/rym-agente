import type { AsientoTango } from "@/lib/conciliacion/asientos-tango"
import { TANGO_HEADERS } from "@/lib/conciliacion/asientos-tango"

const NUM_COLS = new Set(["DEBE", "HABER", "SALDO"])

export function AsientosTangoTable({ rows }: { rows: AsientoTango[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay asientos pendientes para subir.</p>
  }
  const cells = (r: AsientoTango): string[] => [
    r.codMoneda, r.siglaMone, r.descMone, r.fecha, r.codComp,
    r.nComp, r.barra, r.leyenda, r.debe, r.haber, r.saldo,
  ]
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted/60 border-b">
            {TANGO_HEADERS.map(h => (
              <th
                key={h}
                className={`px-3 py-2 font-semibold uppercase tracking-wide whitespace-nowrap ${NUM_COLS.has(h) ? "text-right" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              {cells(r).map((v, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 whitespace-nowrap ${NUM_COLS.has(TANGO_HEADERS[j]) ? "text-right tabular-nums" : ""}`}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
