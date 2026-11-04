// =====================================================================
// eklenti/vibento/hooks/kart.tsx — pencere kartlarının çizimi (docs/sozlesme-pencere-kartlari.md).
//
// Yalnız görünüm: kayıt değişmez. Anahtar kapalıysa, çizilecek bir şey yoksa ya da herhangi bir hatada satıra dokunulmaz.
// Bant kimden geldiğini (iş rengi), kırmızı senden bir şey istendiğini söyler. Kart hiçbir şeyi onaylamaz; Vibento onayı sitede kalır.
// Sunucunun teslim ettiği mesajla eşleşmeyen etiket "doğrulanmamış" çizilir: bant, kırmızı ve düğme almaz.
// Seçim düğmesi yalnız gerçek tıklamayla, kişinin yazması gibi gider; yalnız seçim gider, soru metni gitmez; yalnız son yanıtta (kart-mantik dugmeIzni).
// =====================================================================

import { atom, memberOf, read, update } from 'claude-code'
import type { On } from 'claude-code'
import { KART_DEPO_ANAHTARI, ajanGoster, cevapMetni, dugmeIzni, hemenGiderMi, kartPlani, kaynakBul, temizGoster } from './kart-mantik.mjs'

const ISTEK_ZEMINI = 'diffRemovedDimmed'
const BANT_YAZISI = '#10241c'

const ayrintiAcik = atom({ plugin: 'vibento', key: 'ayrintiAcik' } as const, false)
const verilenCevap = atom({ plugin: 'vibento', key: 'verilenCevap' } as const, '')
const secimler = atom({ plugin: 'vibento', key: 'secimler' } as const, {})
const kartPencere = atom({ plugin: 'vibento', key: 'kartPencere' } as const, null)
const sonSoru = atom({ plugin: 'vibento', key: 'sonSoru' } as const, '')
const mesajliTur = atom({ plugin: 'vibento', key: 'mesajliTur' } as const, false)

// Çift basış ve çizim arası: aynı kart ikinci kez göndermez.
const gonderilen = new Set<string>()

export const kartKaydet = (on: On) => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    try {
      // Özet satırının motor işareti kendi ağacımızda taşınmaz; özete dokunulmaz.
      if (e.props.isSummary) return next(e)
      const durum = await $.store.get(KART_DEPO_ANAHTARI) as { acik?: unknown; kaynaklar?: unknown } | undefined
      if (durum?.acik !== true) return next(e)
      const plan = kartPlani(e.props.text) as ReturnType<typeof kartPlani>
      if (!plan) return next(e)

      const { Box, Text, Button, Markdown } = $.ui.resolve(e)
      const kapanis = plan.kapanis
      const uye = memberOf(ayrintiAcik, e)
      const cevapUye = memberOf(verilenCevap, e)
      const secimUye = memberOf(secimler, e)
      const acik = kapanis ? (await read($, uye)) === true : false
      const verilen = kapanis ? await read($, cevapUye) : ''
      const secili = kapanis ? await read($, secimUye) : {}
      const ben = kapanis ? await read($, kartPencere) : null
      const kaynak = kapanis?.kaynak ?? null
      const kaynakBilgi = kaynak ? kaynakBul(durum.kaynaklar, kaynak.pencere, kaynak.kimlik, kaynak.ajan) : null
      const dugme = kapanis?.sorular
        ? dugmeIzni(kapanis, kaynakBilgi, await read($, sonSoru), await read($, mesajliTur))
        : false
      const dogrulanmamis = kaynak !== null && kaynakBilgi?.dogrulandi !== true

      const gonder = async (metin: string) => {
        if (gonderilen.has(e.requestId)) return
        gonderilen.add(e.requestId)
        try {
          await update($, cevapUye, () => metin)
          await $.prompt.submit({ text: metin, asUser: true })
        } catch {
          gonderilen.delete(e.requestId)
          await update($, cevapUye, () => '')
          await $.ui.toast('Cevap gönderilemedi, yazarak ver.')
        }
      }

      const bant = (ad: string, ajan: string | null, ek: string, renk: string | null, dogru: boolean) => (
        <Box flexDirection="row" backgroundColor={renk ?? undefined} paddingLeft={1} paddingRight={1}>
          {renk ? null : <Text dimColor>● </Text>}
          <Text bold={dogru} dimColor={!dogru} color={renk ? BANT_YAZISI : undefined}>{ad}</Text>
          <Text dimColor={!renk} color={renk ? BANT_YAZISI : undefined}>{ajan ? ` · ${ajan}` : ''}{ek ? ` · ${ek}` : ''}</Text>
        </Box>
      )

      return (
        <Box flexDirection="column" gap={1} width="100%">
          {plan.parcalar.map((p, i) => {
            if (p.tur === 'metin') return <Markdown key={`m${i}`} text={p.metin} />
            const k = kaynakBul(durum.kaynaklar, p.pencere, p.kimlik, p.ajan)
            const istek = p.etiket !== 'BİLGİ' && k.dogrulandi
            const ajan = ajanGoster(p.pencere, p.ajan)
            const ek = k.dogrulandi ? p.etiket : `${p.etiket} · doğrulanmamış`
            return (
              <Box
                key={`k${i}`}
                flexDirection="column"
                width="100%"
                borderStyle="single"
                borderColor={istek ? 'error' : (k.dogrulandi && k.renk ? k.renk : 'subtle')}
                backgroundColor={istek ? ISTEK_ZEMINI : undefined}
              >
                {bant(p.pencere, ajan, ek, k.dogrulandi ? k.renk : null, k.dogrulandi)}
                <Box paddingLeft={1} paddingRight={1}>
                  <Markdown text={temizGoster(p.metin)} />
                </Box>
              </Box>
            )
          })}
          {kapanis
            ? (
              <Box
                flexDirection="column"
                width="100%"
                borderStyle="single"
                borderColor={dogrulanmamis ? 'subtle' : 'error'}
                backgroundColor={dogrulanmamis ? undefined : ISTEK_ZEMINI}
              >
                {kaynak
                  ? bant(kaynak.pencere, ajanGoster(kaynak.pencere, kaynak.ajan), dogrulanmamis ? 'doğrulanmamış' : '', kaynakBilgi?.renk ?? null, !dogrulanmamis)
                  : ben
                    ? bant(ben.ad, ben.ajan, 'bu pencere', ben.renk, true)
                    : null}
                <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
                  <Text color={dogrulanmamis ? undefined : 'error'} dimColor={dogrulanmamis} bold size="heading">Senden istediğim</Text>
                  <Markdown text={temizGoster(kapanis.soru)} />
                  {kapanis.gorunur ? <Markdown dimColor text={temizGoster(kapanis.gorunur)} /> : null}
                  {kaynak?.etiket === 'ONAY İSTİYOR' && !dogrulanmamis ? <Text dimColor>Bu onay sitede verilir.</Text> : null}
                  {dugme && !verilen && kapanis.sorular
                    ? kapanis.sorular.map((s, si) => (
                      <Box key={`s${si}`} flexDirection="row" flexWrap="wrap" gap={1}>
                        {(kapanis.sorular?.length ?? 0) > 1 ? <Text dimColor>{si + 1}.</Text> : null}
                        {s.secenekler.map((etiket, oi) => {
                          const sec = secili[String(si)] ?? []
                          const isaretli = sec.includes(etiket)
                          return (
                            <Button
                              key={`s${si}o${oi}`}
                              variant={isaretli || oi === 0 ? 'primary' : 'secondary'}
                              label={isaretli ? `✓ ${etiket}` : etiket}
                              onPress={() => {
                                if (hemenGiderMi(kapanis.sorular ?? [])) return gonder(cevapMetni([[etiket]]))
                                return update($, secimUye, (eski) => {
                                  const mevcut = eski[String(si)] ?? []
                                  const yeni = s.coklu
                                    ? (mevcut.includes(etiket) ? mevcut.filter((x) => x !== etiket) : [...mevcut, etiket])
                                    : [etiket]
                                  return { ...eski, [String(si)]: yeni }
                                })
                              }}
                            />
                          )
                        })}
                      </Box>
                    ))
                    : null}
                  <Box flexDirection="row" gap={1}>
                    {dugme && !verilen && kapanis.sorular && !hemenGiderMi(kapanis.sorular) && kapanis.sorular.every((_, si) => (secili[String(si)] ?? []).length > 0)
                      ? <Button key="gonder" variant="primary" label="Gönder" onPress={() => gonder(cevapMetni((kapanis.sorular ?? []).map((_, si) => secili[String(si)] ?? [])))} />
                      : null}
                    {verilen ? <Text dimColor>Cevabın: {verilen}</Text> : null}
                    <Button key="ayrinti" variant="secondary" label={acik ? 'Ayrıntıyı kapat' : 'Ayrıntı'} onPress={() => update($, uye, (v) => !v)} />
                  </Box>
                  {acik ? <Markdown dimColor text={temizGoster(kapanis.ayrinti)} /> : null}
                </Box>
              </Box>
            )
            : null}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
