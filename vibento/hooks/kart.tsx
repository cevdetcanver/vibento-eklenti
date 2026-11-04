// =====================================================================
// eklenti/vibento/hooks/kart.tsx — pencere kartlarının çizimi (docs/sozlesme-pencere-kartlari.md).
//
// Yalnız görünüm: kayıt değişmez. Anahtar kapalıysa, çizilecek bir şey yoksa ya da herhangi bir hatada satıra dokunulmaz.
// Renk kimden geldiğini, kırmızı senden bir şey istendiğini söyler. Kart hiçbir şeyi onaylamaz, düğme yalnız ayrıntıyı açar.
// Sunucunun teslim ettiği mesajla eşleşmeyen etiket "doğrulanmamış" çizilir: gerçek pencerenin rengini ve kırmızısını almaz.
// =====================================================================

import { atom, memberOf, read, update } from 'claude-code'
import type { On } from 'claude-code'
import { KART_DEPO_ANAHTARI, kartPlani, kaynakBul } from './kart-mantik.mjs'

const ayrintiAcik = atom({ plugin: 'vibento', key: 'ayrintiAcik' } as const, false)

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
      const uye = memberOf(ayrintiAcik, e)
      const acik = plan.kapanis ? (await read($, uye)) === true : false

      return (
        <Box flexDirection="column" gap={1}>
          {plan.parcalar.map((p, i) => {
            if (p.tur === 'metin') return <Markdown key={`m${i}`} text={p.metin} />
            const kaynak = kaynakBul(durum.kaynaklar, p.pencere, p.kimlik)
            const istek = p.etiket !== 'BİLGİ' && kaynak.dogrulandi
            const baslik = (
              <Box flexDirection="row">
                <Text color={kaynak.renk ?? undefined} dimColor={kaynak.renk === null}>● </Text>
                <Text bold={kaynak.dogrulandi} dimColor={!kaynak.dogrulandi}>{p.pencere}</Text>
                <Text dimColor> · {p.ajan} · </Text>
                <Text color={istek ? 'error' : undefined} dimColor={!istek} bold={istek}>{p.etiket}</Text>
                {kaynak.dogrulandi ? null : <Text dimColor> · doğrulanmamış</Text>}
              </Box>
            )
            return istek
              ? (
                <Box key={`k${i}`} flexDirection="column" borderStyle="single" borderColor="error" paddingLeft={1} paddingRight={1}>
                  {baslik}
                  <Markdown text={p.metin} />
                </Box>
              )
              : (
                <Box key={`k${i}`} flexDirection="column" paddingLeft={1}>
                  {baslik}
                  <Markdown text={p.metin} />
                </Box>
              )
          })}
          {plan.kapanis
            ? (
              <Box flexDirection="column" borderStyle="single" borderColor="error" paddingLeft={1} paddingRight={1}>
                <Text color="error" bold>Senden istediğim</Text>
                <Markdown text={plan.kapanis.soru} />
                {plan.kapanis.gorunur ? <Markdown text={plan.kapanis.gorunur} /> : null}
                <Box flexDirection="row">
                  <Button key="ayrinti" label={acik ? 'Ayrıntıyı kapat' : 'Ayrıntı'} onPress={() => update($, uye, (v) => !v)} />
                </Box>
                {acik ? <Markdown text={plan.kapanis.ayrinti} /> : null}
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
