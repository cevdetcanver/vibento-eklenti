// =====================================================================
// eklenti/vibento/hooks/register.ts — Vibento'nun Claude Code eklentisi (mod; V1 Adım 3g-3, sözleşme docs/sozlesme-3g-esleme.md §5, Ek 1).
//
// İNCE BAĞLAYICI: iş mantığı sunucuda. Bu modül olayları bağlar: eşleme (esleme.ts), olay iletimi (olay.ts). Kırmızı çizgi: hiçbir hata
// turu bozmaz; her kanca ağ ya da depo hatasında `next(e)`'nin sonucunu aynen döner (fail-open).
// Motor kuralı: `$` değer olarak geçirilmez; her kanca `io`'yu kendi `$`'ından kurar (io.ts). Kurulum satırı her kancada aynıdır.
// =====================================================================

import type { Register } from 'claude-code'
import type { Io } from './io.ts'
import { sunucuAdresi } from './esleme-mantik.mjs'
import { acilisCiktisi, pencereMesajiMetni, istemSinifi, ideBaglamiSoy } from './olay-mantik.mjs'
import { kapiAnahtari, kapiHazirla, kapiKarari, onayKarariAyikla, onayKarariMesaji, mesajGecerli } from './kapi-mantik.mjs'
import { aracKimligiGirdisi, izinVerilirMi, vibentoAracAdi } from './kimlik-mantik.mjs'
import { eslemeKur } from './esleme.ts'
import { olayKur } from './olay.ts'
import { senkKur, istekYap, type Istek } from './senk.ts'
import { altAjanEsitle } from './altajan.ts'
import { uyandirmaKur } from './uyandirma.ts'

const bagla = (r: { additionalContext?: string[] }, satir: string | null) =>
  satir ? { ...r, additionalContext: [...(r.additionalContext ?? []), satir] } : r

export const register: Register = (on, options) => {
  const sunucu = sunucuAdresi(options.sunucu)
  const esleme = eslemeKur(sunucu)
  const olaylar = olayKur(sunucu)
  const senk = senkKur(sunucu)
  const istek: Istek = (io, t, y, m, g, ms) => istekYap(io, sunucu, t, y, m, g, ms)
  // Boştaki pencere de anahtarın reddedildiğini yoklamada öğrenir: bildirim düşer, sonraki istemde kod gelir.
  const uyandirma = uyandirmaKur(istek, (io, jeton) => esleme.jetonReddedildi(io, jeton))

  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms) => $.process.run(a, { timeoutMs: ms, cwd: (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined }),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
    }
    try {
      const kod = await esleme.acilis(io)
      if (kod) return bagla(r, kod)
      const k = await esleme.baglantiOku(io)
      if (!k) return r
      const y = await olaylar.ilet(io, k, e as unknown as Record<string, unknown>)
      // Anahtar reddedildi: pencere sessizce kopmasın, kod bu açılışta gelsin (eskiden ikinci bir konuşma gerekiyordu; 2 Kas ölçüldü).
      if (y === 'reddedildi') { await esleme.jetonReddedildi(io, k.token); return bagla(r, await esleme.istem(io)) }
      const { baglam, oturumAdi } = acilisCiktisi(e as unknown as Record<string, unknown>, y.govde)
      // Açılış da pencereyi boşa düşürür: yeni açılan pencere de uyandırılabilir olmalı (kanca: `--dinle` Stop VE SessionStart'ta).
      const yeniNesil = e.source === 'startup' || e.source === 'resume' || e.source === 'clear'
      if (yeniNesil) uyandirma.basla(io, k.token, e.session_id)
      // Açılış pencereyi uyandıracaksa mesajlar o turda teslim edilir; burada onaylanmaz (01-bas.mjs baglamiBas, aynı istisna).
      const uy = y.govde?.uyandirma as { acik?: unknown; bekleyen?: unknown } | undefined
      const uyanacak = yeniNesil && uy?.acik === true && Number(uy.bekleyen) > 0
      if (baglam && y.govde && !uyanacak) await olaylar.teslimKaydet(io, e.session_id, y.govde.pencere_mesaji_idler)
      const sonuc = bagla(r, baglam)
      return oturumAdi ? { ...sonuc, sessionTitle: oturumAdi } : sonuc
    } catch {
      return r
    }
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms) => $.process.run(a, { timeoutMs: ms, cwd: (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined }),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
    }
    try {
      // Pencere artık boşta değil: uyandırma yoklaması durur; insan istemi uyanma frenini sıfırlar.
      uyandirma.istem(e.session_id, istemSinifi(e.prompt) === 'insan')
      const not = await esleme.istem(io)
      const k = await esleme.baglantiOku(io)
      if (!k) return bagla(r, not)
      // Ad kapısı (sözleşme ad-kapisi §4) ve onay kararı (onay-talebi Ek 5 E5.2): metin gitmez, yalnız kapı kimliği / karar.
      const kAnahtar = kapiAnahtari(e.session_id)
      const hazir = kapiHazirla(e.prompt, kAnahtar ? await io.depoOku(kAnahtar) : null, kAnahtar)
      const ek: Record<string, unknown> = {}
      if (hazir.onay) ek.kapi_onay = hazir.onay
      const karar = istemSinifi(e.prompt) === 'insan' ? onayKarariAyikla(ideBaglamiSoy(e.prompt)) : null
      if (karar) ek.onay_karari = karar
      const y = await olaylar.ilet(io, k, e as unknown as Record<string, unknown>, ek)
      if (y === 'reddedildi') { await esleme.jetonReddedildi(io, k.token); return bagla(r, (await esleme.istem(io)) ?? not) }
      // Öncelik: ad kapısı > onay kararı > pencere mesajı; o turda tek çıktı (değişmez 2, 10, 13). Her hata: durdurma yok.
      const kapi = kapiKarari(hazir, y.govde, e.prompt)
      const adim = kapi.yerel
      if (kAnahtar && adim === 'sil') await io.depoSil(kAnahtar)
      else if (kAnahtar && typeof adim === 'object' && adim !== null) {
        await io.depoYaz(kAnahtar, { ...adim, zaman: new Date(await io.simdi()).toISOString() })
      }
      if (mesajGecerli(kapi.mesaj)) return { ...r, block: kapi.mesaj as string, suppressOriginalPrompt: true }
      const onayMesaji = onayKarariMesaji(karar !== null, y.govde)
      if (onayMesaji) return { ...r, block: onayMesaji, suppressOriginalPrompt: true }
      const mesaj = pencereMesajiMetni(y.govde)
      if (mesaj && y.govde) await olaylar.teslimKaydet(io, e.session_id, y.govde.pencere_mesaji_idler)
      return bagla(bagla(r, not), mesaj)
    } catch {
      return r
    }
  })

  // Kimlik kanıtı (değişmez 14): ağ yok, depo yazımı yok; yalnız jeton okunur. Vibento dışı araçta hiçbir şey yapılmaz.
  on('classic.PreToolUse', async ($, e, next) => {
    const r = await next(e)
    try {
      if (vibentoAracAdi(e.tool) === null) return r
      const { tool: _arac, tool_use_id: _kimlik, agentId: _ajan, ...girdi } = e as unknown as Record<string, unknown>
      const k = await $.store.get('vibento.baglanti') as { token?: unknown } | undefined
      const jeton = typeof k?.token === 'string' ? k.token : null
      const yeni = await aracKimligiGirdisi(e.tool, await $.session.id(), girdi, jeton)
      const sonuc = yeni ? { ...r, updatedInput: yeni } : r
      // Altta karar yoksa eklentinin kendi araçları izin sormaz (kimlik-mantik.mjs izinVerilirMi); değişmez 14'ün eklentideki tek eki.
      if (izinVerilirMi(e.tool) && !r.allow && !r.ask && !r.deny) {
        return { allow: true as const, ...(yeni ? { updatedInput: yeni } : {}), ...(r.additionalContext ? { additionalContext: r.additionalContext } : {}) }
      }
      return sonuc
    } catch {
      return r
    }
  })

  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms) => $.process.run(a, { timeoutMs: ms, cwd: (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined }),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
    }
    try {
      const k = await esleme.baglantiOku(io)
      if (!k) return r
      const y = await olaylar.ilet(io, k, e as unknown as Record<string, unknown>)
      if (y === 'reddedildi') { await esleme.jetonReddedildi(io, k.token); return r }
      // Sohbet kaydı arka planda (tur beklemez); aynı dosyada ikinci eşitleme başlamaz (senk.ts).
      // Pencere boşa düştü: uyandırma yoklaması başlar (Realtime yerine; mod ortamında WebSocket yok).
      uyandirma.basla(io, k.token, e.session_id)
      void senk.senkYap(io, k.token, e.transcript_path, e.session_id, e.cwd, 20_000)
        .then(() => altAjanEsitle(io, istek, k.token, e.transcript_path, e.session_id, 15_000))
      // Değişmez 11: Stop'ta block yok; Claude zaten bir Stop kancası yüzünden devam ediyorsa mesaj basılmaz.
      if (e.stop_hook_active === true) return r
      const mesaj = pencereMesajiMetni(y.govde)
      if (mesaj && y.govde) await olaylar.teslimKaydet(io, e.session_id, y.govde.pencere_mesaji_idler)
      return bagla(r, mesaj)
    } catch {
      return r
    }
  })

  on('classic.PreCompact', async ($, e, next) => {
    const r = await next(e)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms) => $.process.run(a, { timeoutMs: ms, cwd: (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined }),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
    }
    try {
      const k = await esleme.baglantiOku(io)
      if (k && (await olaylar.ilet(io, k, e as unknown as Record<string, unknown>)) === 'reddedildi') await esleme.jetonReddedildi(io, k.token)
      else if (k) void senk.senkYap(io, k.token, e.transcript_path, e.session_id, e.cwd, 20_000)
    } catch {
      // fail-open
    }
    return r
  })

  on('classic.SessionEnd', async ($, e, next) => {
    const r = await next(e)
    esleme.durdur()
    uyandirma.durdur(e.session_id)
    const io: Io = {
      depoOku: (k) => $.store.get(k), depoYaz: (k, v) => $.store.set(k, v), depoSil: (k) => $.store.delete(k),
      istek: (u, s) => $.http.fetch(u, s), komut: async (a, ms) => $.process.run(a, { timeoutMs: ms, cwd: (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? undefined }),
      herBirde: (ms, fn) => $.clock.every(ms, fn), sonra: (ms, fn) => $.clock.after(ms, fn), bildir: (t) => $.ui.toast(t),
      simdi: () => $.clock.now(),
      dosyaBoyu: async (y) => { try { const s = await $.fs.stat(y); return typeof s?.size === 'number' ? s.size : null } catch { return null } },
      dizin: async (y) => (await $.fs.list(y)).map((g) => ({ name: g.name, kind: g.kind, size: g.size, mtimeMs: g.mtimeMs })),
      istemGonder: (t) => $.prompt.submit({ text: t }),
      evKlasoru: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null,
      dosyaYaz: (y, m) => $.fs.write(y, m),
      dosyaOku: async (y) => String(await $.fs.read(y)),
      mcpBagla: async () => { await $.mcp.connect('vibento') },
    }
    try {
      // Değişmez 10: ad kapısının yerel adımı oturum kapanınca silinir.
      const kAnahtar = kapiAnahtari(e.session_id)
      if (kAnahtar) await io.depoSil(kAnahtar)
      const k = await esleme.baglantiOku(io)
      if (k && (await olaylar.ilet(io, k, e as unknown as Record<string, unknown>)) === 'reddedildi') await esleme.jetonReddedildi(io, k.token)
      // Kapanışta kısa bütçe (bugünkü kanca 1 sn): kalan, bir sonraki açılışın Stop'unda sunucunun ofsetinden sürer.
      else if (k) await senk.senkYap(io, k.token, e.transcript_path, e.session_id, e.cwd, 1_500)
    } catch {
      // fail-open
    }
    return r
  })
}
