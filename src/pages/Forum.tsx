import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ForumCriterion, ForumEvaluation, ForumRankingEntry } from '../types'

const CRITERIA: ForumCriterion[] = ['impacto', 'viabilidad', 'urgencia', 'alineacion', 'costo']

interface MonthImprovement {
  id: string
  title: string
  area: string
  date_submitted: string
  status: string
}

interface ScoreDraft {
  impacto: number
  viabilidad: number
  urgencia: number
  alineacion: number
  costo: number
  comment: string
}

const DEFAULT_DRAFT: ScoreDraft = {
  impacto: 3, viabilidad: 3, urgencia: 3, alineacion: 3, costo: 3, comment: '',
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string, lang: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(lang, { month: 'long', year: 'numeric' })
}

function evalScore(e: ForumEvaluation): number {
  return e.impacto + e.viabilidad + e.urgencia + e.alineacion + e.costo
}

function draftFromEval(e: ForumEvaluation | undefined): ScoreDraft {
  if (!e) return { ...DEFAULT_DRAFT }
  return {
    impacto: e.impacto, viabilidad: e.viabilidad, urgencia: e.urgencia,
    alineacion: e.alineacion, costo: e.costo, comment: e.comment,
  }
}

function ScoreSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value === n
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-9 py-1.5 text-xs font-medium border-r last:border-r-0 transition-colors ${
              selected
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

export default function Forum() {
  const { t, i18n } = useTranslation()
  const { profile, isManager } = useAuth()

  const [improvements, setImprovements] = useState<MonthImprovement[]>([])
  const [evaluations, setEvaluations] = useState<ForumEvaluation[]>([])
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>({})
  const [selectedMonth, setSelectedMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: impData, error: impErr }, { data: evalData, error: evalErr }] = await Promise.all([
      supabase
        .from('improvements')
        .select('id,title,area,date_submitted,status')
        .not('status', 'in', '(draft,rejected)')
        .order('date_submitted', { ascending: false }),
      supabase.from('forum_evaluations').select('*'),
    ])
    if (impErr || evalErr) {
      setError((impErr ?? evalErr)?.message ?? 'Error')
      setLoading(false)
      return
    }
    const imps = (impData ?? []) as MonthImprovement[]
    setImprovements(imps)
    setEvaluations((evalData ?? []) as ForumEvaluation[])

    const months = [...new Set(imps.map((i) => monthKey(i.date_submitted)))]
    const cur = currentMonthKey()
    setSelectedMonth(months.includes(cur) ? cur : (months[0] ?? cur))
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const availableMonths = useMemo(
    () => [...new Set(improvements.map((i) => monthKey(i.date_submitted)))].sort().reverse(),
    [improvements],
  )

  const monthImprovements = useMemo(
    () => improvements.filter((i) => monthKey(i.date_submitted) === selectedMonth),
    [improvements, selectedMonth],
  )

  useEffect(() => {
    const mine = new Map(
      evaluations.filter((e) => e.evaluator_id === profile?.id).map((e) => [e.improvement_id, e]),
    )
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts((prev) => {
      const next: Record<string, ScoreDraft> = {}
      for (const imp of monthImprovements) {
        next[imp.id] = prev[imp.id] ?? draftFromEval(mine.get(imp.id))
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, improvements, profile?.id])

  const ranking = useMemo<ForumRankingEntry[]>(() => {
    const rows = monthImprovements.map((imp) => {
      const evs = evaluations.filter((e) => e.improvement_id === imp.id)
      const evaluator_count = evs.length
      const avg_score = evaluator_count
        ? evs.reduce((s, e) => s + evalScore(e), 0) / evaluator_count
        : 0
      return {
        improvement_id: imp.id,
        title: imp.title,
        area: imp.area,
        avg_score,
        evaluator_count,
        rank: 0,
        is_top: false,
      }
    })
    rows.sort((a, b) => b.avg_score - a.avg_score)
    rows.forEach((r, i) => {
      r.rank = i + 1
      r.is_top = r.evaluator_count > 0 && i < 5
    })
    return rows
  }, [monthImprovements, evaluations])

  const setDraftField = (impId: string, field: keyof ScoreDraft, value: number | string) => {
    setDrafts((prev) => ({ ...prev, [impId]: { ...prev[impId], [field]: value } }))
  }

  const handleSave = async (impId: string) => {
    if (!profile) return
    const d = drafts[impId]
    if (!d) return
    setSavingId(impId)
    setError(null)
    const { data, error: saveErr } = await supabase
      .from('forum_evaluations')
      .upsert(
        {
          improvement_id: impId,
          evaluator_id: profile.id,
          impacto: d.impacto,
          viabilidad: d.viabilidad,
          urgencia: d.urgencia,
          alineacion: d.alineacion,
          costo: d.costo,
          comment: d.comment,
        },
        { onConflict: 'improvement_id,evaluator_id' },
      )
      .select()
      .single()
    setSavingId(null)
    if (saveErr) {
      setError(saveErr.message)
      return
    }
    const saved = data as ForumEvaluation
    setEvaluations((prev) => [
      ...prev.filter((e) => !(e.improvement_id === impId && e.evaluator_id === profile.id)),
      saved,
    ])
    setSavedId(impId)
    setTimeout(() => setSavedId((cur) => (cur === impId ? null : cur)), 2500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin border-4 border-blue-600 border-t-transparent rounded-full w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('forum.title')}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('forum.subtitle')}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('forum.month')}</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
          >
            {availableMonths.length === 0 && <option value={selectedMonth}>{monthLabel(selectedMonth || currentMonthKey(), i18n.language)}</option>}
            {availableMonths.map((m) => (
              <option key={m} value={m} className="capitalize">
                {monthLabel(m, i18n.language)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error}
        </div>
      )}

      {monthImprovements.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          {t('forum.noImprovements')}
        </div>
      ) : (
        <div className={`grid gap-6 ${isManager ? 'lg:grid-cols-3' : 'grid-cols-1'}`}>
          {isManager && (
            <div className="lg:col-span-2 space-y-4">
              {monthImprovements.map((imp) => {
                const d = drafts[imp.id] ?? DEFAULT_DRAFT
                return (
                  <div key={imp.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{imp.title}</p>
                        <p className="text-xs text-gray-500">{imp.area}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{t('forum.scaleHint')}</span>
                    </div>

                    <div className="space-y-2.5">
                      {CRITERIA.map((c) => (
                        <div key={c} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-700">{t(`forum.criteria.${c}`)}</p>
                            {c === 'costo' && (
                              <p className="text-xs text-gray-400">{t('forum.costoHint')}</p>
                            )}
                          </div>
                          <ScoreSelector value={d[c]} onChange={(v) => setDraftField(imp.id, c, v)} />
                        </div>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={d.comment}
                      onChange={(e) => setDraftField(imp.id, 'comment', e.target.value)}
                      placeholder={t('forum.comment')}
                      className="mt-3 block w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />

                    <div className="flex items-center justify-end gap-3 mt-3">
                      {savedId === imp.id && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                          <CheckCircle size={14} /> {t('forum.saved')}
                        </span>
                      )}
                      <button
                        onClick={() => handleSave(imp.id)}
                        disabled={savingId === imp.id}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {savingId === imp.id ? t('common.loading') : t('forum.saveScores')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {t('forum.ranking')}
              </h2>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
              {ranking.map((r) => (
                <div
                  key={r.improvement_id}
                  className={`flex items-center gap-3 px-4 py-3 ${r.is_top ? 'bg-amber-50' : ''}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0 ${
                      r.is_top ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                    <p className="text-xs text-gray-400">
                      {r.evaluator_count > 0
                        ? `${r.evaluator_count} ${t('forum.evaluators')}`
                        : t('forum.notEvaluated')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-blue-700">{r.avg_score.toFixed(1)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('forum.avgScore')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
