// =====================================================================
// eklenti/vibento/hooks/uyandirma.ts — boştaki pencereyi uyandırma (3g-3d; DECISIONS 2 Kas ③ Ek; bugünkü kanca 03-uyandirma.mjs --dinle).
//
// Mod ortamında WebSocket yok → Realtime dinleyicisi yerine YOKLAMA: Stop'tan (pencere boşa düştü) sonra `/api/uyandirma/yokla` aralıklarla
// sorulur; sunucu "bekleyen > 0" derse pencere `$.prompt.submit(UYANDIRMA_METNI)` ile uyandırılır ve yoklama durur (uyanan tur Stop'unda
// yeniden başlar). Herhangi bir istem (insan ya da değil) yoklamayı durdurur; insan istemi fren sayacını sıfırlar. Fren: insan istemi
// gelmeden en çok `fren` (sunucudan; yoksa 3) uyanma (değişmez 12, uyanma freni). İçerik taşımaz; hiçbir hata turu bozmaz.
// Maliyet (2 Kas ölçümü, Vercel fra1): yoklama başına ~3,4e-6 USD; aralık 15 sn × 20 → 60 sn × 55 → 180 sn (boşta saatte ~ilk 140, sonra 20).
// =====================================================================

import type { Io } from './io.ts'
import type { Istek } from './senk.ts'
import { UYANDIRMA_METNI } from './olay-mantik.mjs'

const FREN_VARSAYILAN = 3

/** n. yoklamadan önceki bekleme (ms). */
export function yoklamaAraligi(n: number): number {
  if (n < 20) return 15_000
  if (n < 75) return 60_000
  return 180_000
}

type Bosta = { zaman: { cancel(): void } | null; n: number; kusak: number }

export function uyandirmaKur(istek: Istek) {
  const bostakiler = new Map<string, Bosta>()
  const uyanmalar = new Map<string, number>()
  let kusakSayaci = 0

  function durdur(sid: string) {
    const b = bostakiler.get(sid)
    b?.zaman?.cancel()
    bostakiler.delete(sid)
  }

  return {
    /** Stop: pencere boşa düştü; yoklamayı (baştan) başlat. */
    basla(io: Io, token: string, sid: unknown) {
      if (typeof sid !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(sid)) return
      durdur(sid)
      const b: Bosta = { zaman: null, n: 0, kusak: (kusakSayaci += 1) }
      bostakiler.set(sid, b)
      const kur = () => {
        b.zaman = io.sonra(yoklamaAraligi(b.n), () => { void yokla() })
      }
      const yokla = async () => {
        if (bostakiler.get(sid)?.kusak !== b.kusak) return // bu arada istem geldi ya da yeniden başladı
        b.n += 1
        try {
          const y = await istek(io, token, '/api/uyandirma/yokla', 'POST', { dis_seans_id: sid }, 8_000)
          if (bostakiler.get(sid)?.kusak !== b.kusak) return
          if (y.kod === 401 || y.kod === 404) { durdur(sid); return }
          const g = y.govde
          if (y.ok && g?.ok === true && g.acik === true && Number(g.bekleyen) > 0) {
            const fren = Number.isInteger(g.fren) && Number(g.fren) >= 1 ? Number(g.fren) : FREN_VARSAYILAN
            const sayi = uyanmalar.get(sid) ?? 0
            durdur(sid)
            if (sayi >= fren) return // fren: insan istemi gelene kadar başka uyanma yok
            uyanmalar.set(sid, sayi + 1)
            await io.istemGonder(UYANDIRMA_METNI)
            return
          }
          if (y.ok && g?.ok === true && g.acik === false) { durdur(sid); return } // hesapta uyandırma kapalı
        } catch {
          // ağ yok: sonraki aralıkta yeniden
        }
        if (bostakiler.get(sid)?.kusak === b.kusak) kur()
      }
      kur()
    },

    /** İstem geldi: yoklama durur; insan istemi fren sayacını sıfırlar. */
    istem(sid: unknown, insan: boolean) {
      if (typeof sid !== 'string') return
      durdur(sid)
      if (insan) uyanmalar.delete(sid)
    },

    durdur(sid: unknown) {
      if (typeof sid === 'string') durdur(sid)
    },
  }
}
