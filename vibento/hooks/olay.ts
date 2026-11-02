// =====================================================================
// eklenti/vibento/hooks/olay.ts — olayları `/api/hook`'a iletir (3g-3b; bugünkü kanca 01-bas.mjs gonder/kuyruk, 07 ana akış).
//
// Akış (olay başına): kuyruğu boşalt (en eski 20, ilk hatada dur) → gövde + teslim onayı → canlı gönderim (süre bütçeli) → 2xx'te yanıt,
// başka hatada kuyruğa. 401/403: jeton reddedildi (eşleme yeniden başlar). Hiçbir hata turu bozmaz (değişmez 1, 3).
// =====================================================================

import type { Io } from './io.ts'
import {
  KUYRUK_ANAHTARI, KUYRUK_BOSALTMA, govdeKur, kuyrugaEkle, yanitGovdesi, teslimAnahtari, teslimEkle, teslimKimlikleri,
} from './olay-mantik.mjs'

export type Gonderim = { kod: number; govde: Record<string, unknown> | null }

// Süre bütçeleri (01-bas.mjs): SessionStart 12 sn, istem 8 sn, öbürleri 3 sn.
export function butce(olay: string): number {
  if (olay === 'SessionStart') return 12_000
  if (olay === 'UserPromptSubmit') return 8_000
  return 3_000
}

function rastgeleKimlik(): string {
  return crypto.randomUUID()
}

async function sureli<T>(io: Io, ms: number, is: Promise<T>): Promise<T | null> {
  let zaman: { cancel(): void } | null = null
  const zamanAsimi = new Promise<null>((coz) => { zaman = io.sonra(ms, () => coz(null)) })
  try {
    return await Promise.race([is, zamanAsimi])
  } finally {
    ;(zaman as { cancel(): void } | null)?.cancel()
  }
}

export function olayKur(sunucu: string) {
  async function istek(io: Io, token: string, govde: Record<string, unknown>, ms: number): Promise<Gonderim> {
    try {
      const y = await sureli(io, ms, io.istek(`${sunucu}/api/hook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(govde),
      }))
      if (!y) return { kod: 0, govde: null }
      return { kod: y.status, govde: y.status >= 200 && y.status < 300 ? yanitGovdesi(y.text) : null }
    } catch {
      return { kod: 0, govde: null }
    }
  }

  // O7: kuyruk bağlantıya bağlı; bilgisayar başka hesaba eşlenirse eski bağlantının olayları yeni hesaba GİTMEZ.
  const anahtar = (baglantiId: string) => `${KUYRUK_ANAHTARI}.${baglantiId}`

  async function kuyruguBosalt(io: Io, token: string, baglantiId: string): Promise<'devam' | 'reddedildi'> {
    try {
      let kuyruk = (await io.depoOku(anahtar(baglantiId))) as Record<string, unknown>[] | undefined
      if (!Array.isArray(kuyruk) || kuyruk.length === 0) return 'devam'
      for (let i = 0; i < KUYRUK_BOSALTMA && kuyruk.length > 0; i += 1) {
        const r = await istek(io, token, kuyruk[0] as Record<string, unknown>, 3_000)
        if (r.kod === 401 || r.kod === 403) return 'reddedildi'
        if (r.kod < 200 || r.kod >= 300) break
        kuyruk = kuyruk.slice(1)
        await io.depoYaz(anahtar(baglantiId), kuyruk)
      }
      return 'devam'
    } catch {
      return 'devam'
    }
  }

  return {
    /**
     * Bir olayı iletir. `ekAlanlar` gövdeye eklenir (ad kapısı / onay kararı, 3g-3b-2). Dönüş: sunucunun yanıtı (2xx'te gövde), ya da
     * `reddedildi` (jeton geçersiz; çağıran eşlemeyi sıfırlar).
     */
    async ilet(io: Io, k: { token: string; baglanti_id: string }, olay: Record<string, unknown>, ekAlanlar: Record<string, unknown> = {}):
      Promise<Gonderim | 'reddedildi'> {
      const token = k.token
      if ((await kuyruguBosalt(io, token, k.baglanti_id)) === 'reddedildi') return 'reddedildi'
      const govde: Record<string, unknown> = {
        ...govdeKur(olay, { zaman: new Date(await io.simdi()).toISOString(), olay_kimligi: rastgeleKimlik() }),
        ...ekAlanlar,
      }
      const tAnahtar = teslimAnahtari(olay.session_id)
      const bekleyenTeslim = tAnahtar ? teslimKimlikleri(await io.depoOku(tAnahtar)) : []
      if (bekleyenTeslim.length > 0) govde.teslim_alindi = bekleyenTeslim
      const r = await istek(io, token, govde, butce(String(govde.olay)))
      if (r.kod === 401 || r.kod === 403) return 'reddedildi'
      if (r.kod >= 200 && r.kod < 300) {
        if (tAnahtar && bekleyenTeslim.length > 0 && r.govde?.ok === true) {
          const kalan = teslimKimlikleri(await io.depoOku(tAnahtar)).filter((k) => !bekleyenTeslim.includes(k))
          await io.depoYaz(tAnahtar, kalan)
        }
        return r
      }
      try {
        await io.depoYaz(anahtar(k.baglanti_id), kuyrugaEkle(await io.depoOku(anahtar(k.baglanti_id)), govde))
      } catch {
        // depo dolu: olay kaybolur, tur bozulmaz
      }
      return r
    },

    /** Basılan pencere mesajlarının kimlikleri: sonraki istekte `teslim_alindi` olarak gider (sözleşme pencere-mesaj Ek 3). */
    async teslimKaydet(io: Io, seansId: unknown, idler: unknown) {
      const tAnahtar = teslimAnahtari(seansId)
      const yeni = teslimKimlikleri(idler)
      if (!tAnahtar || yeni.length === 0) return
      try {
        await io.depoYaz(tAnahtar, teslimEkle(teslimKimlikleri(await io.depoOku(tAnahtar)), yeni))
      } catch {
        // onay gidemezse mesaj yine gelir (kayıp yok, tekrar olur)
      }
    },
  }
}
