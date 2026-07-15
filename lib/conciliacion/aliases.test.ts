import { describe, it, expect } from "vitest"
import { aprenderAliases, firmasRechazadas, firmaPar } from "@/lib/conciliacion/aliases"

describe("aprenderAliases", () => {
  it("co-ocurrencia >= 2 genera alias banco→Tango", () => {
    // "acme" (banco) co-ocurre con "proveedor" (Tango) en 2 pares confirmados
    const aliases = aprenderAliases([
      { descBanco: "transf acme", descTango: "transf proveedor" },
      { descBanco: "transf acme", descTango: "transf proveedor" },
    ])
    expect(aliases.get("acme")?.has("proveedor")).toBe(true)
    // "transf" es idéntico en ambos lados → nunca alias de sí mismo
    expect(aliases.get("transf")?.has("transf")).not.toBe(true)
  })

  it("co-ocurrencia < 2 NO genera alias", () => {
    const aliases = aprenderAliases([
      { descBanco: "pago acme", descTango: "proveedor comercial" },
    ])
    expect(aliases.size).toBe(0)
  })

  it("respeta el cap de expansiones por token (máx 5)", () => {
    // "acme" co-ocurre 2x con 7 tokens Tango distintos → sólo 5 sobreviven
    const targets = ["alfa", "beta", "gama", "delta", "epsilon", "zeta", "eta"]
    const descTango = targets.join(" ")
    const aliases = aprenderAliases([
      { descBanco: "acme", descTango },
      { descBanco: "acme", descTango },
    ])
    expect(aliases.get("acme")?.size).toBe(5)
  })

  it("es determinístico: misma entrada → mismo resultado", () => {
    const hist = [
      { descBanco: "pago acme corp", descTango: "proveedor acme sa" },
      { descBanco: "pago acme corp", descTango: "proveedor acme sa" },
      { descBanco: "deb corp servicios", descTango: "gasto servicios varios" },
      { descBanco: "deb corp servicios", descTango: "gasto servicios varios" },
    ]
    const a = aprenderAliases(hist)
    const b = aprenderAliases(hist)
    const norm = (m: Map<string, Set<string>>) =>
      JSON.stringify([...m].sort().map(([k, v]) => [k, [...v].sort()]))
    expect(norm(a)).toBe(norm(b))
  })
})

describe("firmasRechazadas / firmaPar", () => {
  it("una firma rechazada se detecta con la misma firmaPar", () => {
    const rechazados = firmasRechazadas([
      { descBanco: "pago proveedor acme", descTango: "cobro cliente xyz" },
    ])
    expect(rechazados.has(firmaPar("pago proveedor acme", "cobro cliente xyz"))).toBe(true)
  })

  it("firmaPar es canónica: el orden de tokens no cambia la firma", () => {
    expect(firmaPar("acme pago proveedor", "xyz cliente cobro"))
      .toBe(firmaPar("proveedor pago acme", "cobro cliente xyz"))
  })

  it("firmaPar distingue pares distintos", () => {
    expect(firmaPar("pago acme", "cobro xyz")).not.toBe(firmaPar("pago beta", "cobro xyz"))
  })
})
