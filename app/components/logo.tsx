import { APP_NAME } from '@/lib/brand'

/**
 * Marca grafica do painel. Enquanto NEXT_PUBLIC_APP_NAME nao for definido,
 * aparece so o simbolo — nenhum nome inventado no lugar do seu.
 */
export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-brand shrink-0 grid place-items-center shadow-[0_0_24px_rgba(47,128,255,0.35)]">
        <span className="w-3 h-3 rounded-sm bg-white" />
      </span>
      {APP_NAME && <span className="text-lg font-bold tracking-tight truncate">{APP_NAME}</span>}
    </div>
  )
}
