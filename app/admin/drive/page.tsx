import { CheckCircle2, Clock, AlertCircle, FolderSync } from "lucide-react"
import { notFound } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { driveArchivos, driveSyncState } from "@/lib/db/schema"
import { isAdmin } from "@/lib/auth/current-user"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SyncButton } from "./sync-button"

// Lee DB + env en cada request — no prerenderizar en build
export const dynamic = "force-dynamic"

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "procesado")
    return <Badge className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 />Procesado</Badge>
  if (estado === "error")
    return <Badge variant="destructive" className="text-xs"><AlertCircle />Error</Badge>
  return <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200"><Clock />Pendiente</Badge>
}

export default async function DriveAdminPage() {
  if (!(await isAdmin())) notFound()

  const configured = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  )
  const [state] = await db.select().from(driveSyncState).where(eq(driveSyncState.id, "default")).limit(1)
  const archivos = await db.select().from(driveArchivos).orderBy(desc(driveArchivos.createdAt)).limit(20)

  const expiracion = state?.channelExpiration ? new Date(state.channelExpiration) : null
  // eslint-disable-next-line react-hooks/purity -- Server Component: corre una vez por request server-side, no es render de cliente
  const canalActivo = !!expiracion && expiracion.getTime() > Date.now()

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 py-5 border-b bg-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
            <FolderSync className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold">Google Drive — Sync</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Ingesta automática de archivos subidos a la carpeta vigilada</p>
          </div>
        </div>
        <SyncButton />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="rounded-xl border bg-card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Credenciales</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                {configured ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Configuradas</>
                ) : (
                  <><AlertCircle className="h-3.5 w-3.5 text-destructive" />Sin configurar</>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Canal de webhook</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                {canalActivo ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Activo</>
                ) : (
                  <><AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />Inactivo</>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expira</p>
              <p className="text-sm font-medium mt-1 tabular-nums">
                {expiracion ? expiracion.toLocaleString("es-AR") : "—"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Últimos archivos</p>
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Clasificación</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Recibido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                        Sin archivos procesados todavía
                      </TableCell>
                    </TableRow>
                  ) : (
                    archivos.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm max-w-xs truncate" title={a.errorMensaje ?? undefined}>{a.nombre}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{a.clasificacion ?? "—"}</TableCell>
                        <TableCell><EstadoBadge estado={a.estado} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">{new Date(a.createdAt).toLocaleString("es-AR")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
