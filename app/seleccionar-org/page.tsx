import { OrganizationList } from "@clerk/nextjs"
import { RymLogo } from "@/components/layout/RymLogo"

// Destino del redirect (proxy.ts) cuando un usuario logueado no tiene
// organización activa. hidePersonal=true: esta app es org-first, no hay
// datos "personales" — dejar elegir personal reabriría el mismo redirect.
export default function SeleccionarOrgPage() {
  return (
    <section className="bg-muted h-screen">
      <div className="flex h-full flex-col items-center justify-center gap-y-6">
        <div className="flex flex-col items-center gap-y-3">
          <RymLogo className="h-10 w-auto" />
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-cabinet-grotesk)" }}
          >
            Elegí una organización
          </h1>
          <p className="text-sm text-muted-foreground">
            Creá una organización nueva o seleccioná una existente para continuar.
          </p>
        </div>
        <OrganizationList
          hidePersonal
          afterSelectOrganizationUrl="/"
          afterCreateOrganizationUrl="/"
        />
      </div>
    </section>
  )
}
