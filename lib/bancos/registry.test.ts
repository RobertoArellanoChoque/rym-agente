import { describe, it, expect } from "vitest"
import { matchBankByAlias } from "@/lib/bancos/registry"
import type { BankConfig } from "@/lib/bancos/types"

const cfg = (id: string, aliases: string[]): BankConfig => ({
  id, name: id, aliases,
  dateFormat: "DD/MM/YYYY", decimalSeparator: ",", thousandSeparator: ".",
  extractionSystemPrompt: null,
})

describe("matchBankByAlias", () => {
  const configs = [cfg("bbva", ["BBVA", "Frances"]), cfg("galicia", ["Galicia"])]

  it("matchea case-insensitive por alias", () => {
    expect(matchBankByAlias("extracto del banco frances sa", configs)?.id).toBe("bbva")
    expect(matchBankByAlias("BANCO GALICIA", configs)?.id).toBe("galicia")
  })

  it("devuelve null cuando ningún alias aparece", () => {
    expect(matchBankByAlias("extracto banco nacion", configs)).toBeNull()
  })

  it("primer match gana (orden de configs)", () => {
    const overlap = [cfg("a", ["banco"]), cfg("b", ["banco"])]
    expect(matchBankByAlias("mi banco", overlap)?.id).toBe("a")
  })
})
