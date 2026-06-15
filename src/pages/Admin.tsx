import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, X, Pencil, Trash2, Upload, Gift, Plus, RotateCcw, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type {
  SQDCMCategory,
  SQDCMPointConfig,
  ImprovementParticipant,
  Improvement,
  SQDCMImpact,
  ImpactLevel,
  ImprovementStatus,
  Award,
  AwardRedemption,
  RedemptionStatus,
  User,
} from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: SQDCMCategory[] = ['S', 'Q', 'D', 'C', 'M']

const CATEGORY_LABELS: Record<SQDCMCategory, string> = {
  S: 'Safety / Seguridad',
  Q: 'Quality / Calidad',
  D: 'Delivery / Entrega',
  C: 'Cost / Costo',
  M: 'Morale / Moral',
}

const STATUS_OPTIONS: ImprovementStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'implemented',
  'rejected',
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface PointConfigRow {
  high: number
  medium: number
}

interface PendingImprovement extends Improvement {
  // sqdcm_impact already parsed via JSON in DB jsonb column
}

interface ParticipantCheck extends ImprovementParticipant {
  selected: boolean
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Tab 1: Point Configuration ───────────────────────────────────────────────

function PointConfigTab() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<Record<SQDCMCategory, PointConfigRow>>(
    () =>
      Object.fromEntries(CATEGORIES.map((c) => [c, { high: 10, medium: 5 }])) as Record<
        SQDCMCategory,
        PointConfigRow
      >
  )
  const [participationPoints, setParticipationPoints] = useState(0)
  const [participationId, setParticipationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadConfig() {
      setLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from('sqdcm_point_config')
          .select('*')

        if (fetchError) throw fetchError

        if (data && data.length > 0) {
          const updated = { ...config }
          for (const row of data as SQDCMPointConfig[]) {
            if (CATEGORIES.includes(row.category)) {
              if (row.impact_level === 'high') {
                updated[row.category] = { ...updated[row.category], high: row.points }
              } else if (row.impact_level === 'medium') {
                updated[row.category] = { ...updated[row.category], medium: row.points }
              }
            }
          }
          setConfig(updated)
        }

        const { data: ps } = await supabase
          .from('point_settings')
          .select('id, participation_points')
          .limit(1)
          .maybeSingle()
        if (ps) {
          setParticipationId(ps.id as string)
          setParticipationPoints(ps.participation_points as number)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    loadConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (category: SQDCMCategory, level: 'high' | 'medium', value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 0)
    setConfig((prev) => ({
      ...prev,
      [category]: { ...prev[category], [level]: num },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const rows: Omit<SQDCMPointConfig, 'id'>[] = []
      for (const category of CATEGORIES) {
        rows.push({ category, impact_level: 'high', points: config[category].high })
        rows.push({ category, impact_level: 'medium', points: config[category].medium })
      }

      const { error: upsertError } = await supabase
        .from('sqdcm_point_config')
        .upsert(rows, { onConflict: 'category,impact_level' })

      if (upsertError) throw upsertError

      const { error: psError } = participationId
        ? await supabase
            .from('point_settings')
            .update({ participation_points: participationPoints })
            .eq('id', participationId)
        : await supabase.from('point_settings').insert({ participation_points: participationPoints })
      if (psError) throw psError

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('admin.pointConfigSubtitle')}</p>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} />
          {t('common.success')}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('admin.category')}
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('admin.highImpact')}
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('admin.mediumImpact')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {CATEGORIES.map((cat) => (
              <tr key={cat} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white text-xs font-bold">
                      {cat}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {CATEGORY_LABELS[cat]}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <input
                    type="number"
                    min={0}
                    value={config[cat].high}
                    onChange={(e) => handleChange(cat, 'high', e.target.value)}
                    className="w-24 mx-auto block rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-center text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-6 py-4 text-center">
                  <input
                    type="number"
                    min={0}
                    value={config[cat].medium}
                    onChange={(e) => handleChange(cat, 'medium', e.target.value)}
                    className="w-24 mx-auto block rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-center text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{t('admin.participationPoints')}</p>
          <p className="text-xs text-gray-400">{t('admin.participationPointsHint')}</p>
        </div>
        <input
          type="number"
          min={0}
          value={participationPoints}
          onChange={(e) => setParticipationPoints(Math.max(0, parseInt(e.target.value, 10) || 0))}
          className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-center text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? t('common.loading') : t('admin.saveConfig')}
        </button>
      </div>
    </div>
  )
}

// ─── Evaluate / Assign Points Modal ────────────────────────────────────────────

interface AssignModalProps {
  improvement: PendingImprovement
  pointConfig: Record<SQDCMCategory, PointConfigRow>
  evaluatorId: string | null
  defaultParticipationPoints: number
  onClose: () => void
  onAssigned: () => void
}

const IMPACT_LEVELS: ImpactLevel[] = ['none', 'medium', 'high']

const IMPACT_STYLES: Record<ImpactLevel, { active: string; inactive: string }> = {
  none:   { active: 'bg-gray-700 text-white border-gray-700',       inactive: 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50' },
  medium: { active: 'bg-yellow-500 text-white border-yellow-500',   inactive: 'bg-white text-yellow-700 border-yellow-200 hover:bg-yellow-50' },
  high:   { active: 'bg-red-600 text-white border-red-600',         inactive: 'bg-white text-red-700 border-red-200 hover:bg-red-50' },
}

function impactPoints(level: ImpactLevel, cat: SQDCMCategory, cfg: Record<SQDCMCategory, PointConfigRow>): number {
  if (level === 'high') return cfg[cat]?.high ?? 0
  if (level === 'medium') return cfg[cat]?.medium ?? 0
  return 0
}

function normaliseImpactList(source: SQDCMImpact[] | undefined): SQDCMImpact[] {
  const arr = Array.isArray(source) ? source : []
  const byCat = new Map(arr.map(i => [i.category, i]))
  return CATEGORIES.map(c => byCat.get(c) ?? { category: c, description: '', impact_level: 'none' as ImpactLevel })
}

function AssignModal({ improvement, pointConfig, evaluatorId, defaultParticipationPoints, onClose, onAssigned }: AssignModalProps) {
  const { t } = useTranslation()
  const isReevaluation = !!improvement.evaluated_at
  const [participationPoints, setParticipationPoints] = useState(defaultParticipationPoints)

  // Submitter's suggestion (read-only hint)
  const submitterImpacts = useMemo(
    () => normaliseImpactList(improvement.submitter_impact),
    [improvement.submitter_impact],
  )

  // Manager's working impacts: pre-fill with current sqdcm_impact (re-eval) or submitter_impact (first eval)
  const [impacts, setImpacts] = useState<SQDCMImpact[]>(() =>
    normaliseImpactList(
      isReevaluation ? improvement.sqdcm_impact : improvement.submitter_impact,
    ),
  )

  const [participants, setParticipants] = useState<ParticipantCheck[]>([])
  const [loadingPart, setLoadingPart] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calculatedPoints = useMemo(
    () => impacts.reduce((sum, i) => sum + impactPoints(i.impact_level, i.category, pointConfig), 0),
    [impacts, pointConfig],
  )

  const totalPerParticipant = calculatedPoints + participationPoints

  useEffect(() => {
    let cancelled = false
    setLoadingPart(true)
    supabase
      .from('improvement_participants')
      .select('*, user:users(id, name, area)')
      .eq('improvement_id', improvement.id)
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else setParticipants(((data ?? []) as ImprovementParticipant[]).map(p => ({ ...p, selected: true })))
        setLoadingPart(false)
      })
    return () => { cancelled = true }
  }, [improvement.id])

  const setImpactLevel = (cat: SQDCMCategory, level: ImpactLevel) => {
    setImpacts(prev => prev.map(i => (i.category === cat ? { ...i, impact_level: level } : i)))
  }

  const setImpactDescription = (cat: SQDCMCategory, description: string) => {
    setImpacts(prev => prev.map(i => (i.category === cat ? { ...i, description } : i)))
  }

  const toggleParticipant = (id: string) => {
    setParticipants(prev => prev.map(p => (p.id === id ? { ...p, selected: !p.selected } : p)))
  }

  const handleConfirm = async () => {
    setError(null)
    const selected = participants.filter(p => p.selected)
    if (selected.length === 0) {
      setError(t('admin.errors.noParticipants'))
      return
    }
    if (totalPerParticipant === 0) {
      setError(t('admin.errors.noImpact'))
      return
    }

    setAssigning(true)
    try {
      // 1. Update improvement with manager's evaluation
      const { error: upErr } = await supabase
        .from('improvements')
        .update({
          sqdcm_impact: impacts,
          evaluated_by: evaluatorId,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', improvement.id)
      if (upErr) throw upErr

      // 2. If re-evaluation, wipe previous assignments
      if (isReevaluation) {
        const { error: delErr } = await supabase
          .from('point_assignments')
          .delete()
          .eq('improvement_id', improvement.id)
        if (delErr) throw delErr
      }

      // 3. Insert new assignments
      const inserts = selected.map(p => ({
        improvement_id: improvement.id,
        user_id: p.user_id,
        points: totalPerParticipant,
        assigned_by: evaluatorId ?? 'manager',
      }))
      const { error: insErr } = await supabase.from('point_assignments').insert(inserts)
      if (insErr) throw insErr

      onAssigned()
      onClose()
    } catch (err) {
      console.error('Assign points error:', err)
      const msg =
        err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
        : JSON.stringify(err)
      setError(msg)
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{t('admin.evaluateImpact')}</h3>
              {isReevaluation && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  <RotateCcw size={11} /> {t('admin.reevaluation')}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{improvement.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('admin.managerImpactDecision')}
              </h4>
              <p className="text-xs text-gray-400">{t('admin.managerImpactHint')}</p>
            </div>

            <div className="space-y-2">
              {impacts.map(imp => {
                const subSuggestion = submitterImpacts.find(s => s.category === imp.category)?.impact_level
                const points = impactPoints(imp.impact_level, imp.category, pointConfig)
                return (
                  <div key={imp.category} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white text-sm font-bold shrink-0">
                          {imp.category}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{t(`sqdcm.${imp.category}`)}</p>
                          {subSuggestion && subSuggestion !== 'none' && (
                            <p className="text-xs text-gray-400">
                              {t('admin.submitterSuggested')}: <span className={
                                subSuggestion === 'high' ? 'text-red-600 font-medium' : 'text-yellow-700 font-medium'
                              }>{t(`sqdcm.impact.${subSuggestion}`)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                          {IMPACT_LEVELS.map(level => {
                            const selected = imp.impact_level === level
                            const styles = IMPACT_STYLES[level]
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => setImpactLevel(imp.category, level)}
                                className={`px-3 py-1.5 text-xs font-medium border-r last:border-r-0 transition-colors ${
                                  selected ? styles.active : styles.inactive
                                }`}
                              >
                                {t(`sqdcm.impact.${level}`)}
                              </button>
                            )
                          })}
                        </div>
                        <span className={`text-sm font-bold w-16 text-right ${points > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                          {points > 0 ? `+${points}` : '—'} pts
                        </span>
                      </div>
                    </div>
                    {imp.impact_level !== 'none' && (
                      <input
                        type="text"
                        value={imp.description}
                        onChange={e => setImpactDescription(imp.category, e.target.value)}
                        placeholder={t('admin.impactDescriptionPlaceholder')}
                        className="mt-3 block w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm placeholder-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{t('admin.participationPoints')}</p>
              <p className="text-xs text-gray-400">{t('admin.participationPointsHint')}</p>
            </div>
            <input
              type="number"
              min={0}
              value={participationPoints}
              onChange={e => setParticipationPoints(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-center text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 px-5 py-3">
            <div>
              <p className="text-xs uppercase font-bold text-blue-700 tracking-wider">{t('admin.calculatedPoints')}</p>
              <p className="text-xs text-blue-600 mt-0.5">{t('admin.perParticipant')}</p>
            </div>
            <span className="text-3xl font-bold text-blue-700">{totalPerParticipant} <span className="text-base font-medium">pts</span></span>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {t('admin.participants')}
            </h4>
            {loadingPart ? (
              <p className="text-sm text-gray-400">{t('common.loading')}</p>
            ) : participants.length === 0 ? (
              <p className="text-sm text-gray-400">{t('common.none')}</p>
            ) : (
              <div className="space-y-1.5">
                {participants.map(p => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => toggleParticipant(p.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{p.user?.name ?? p.user_id}</p>
                      {p.user?.area && <p className="text-xs text-gray-500">{p.user.area}</p>}
                    </div>
                    {p.role_in_project && (
                      <span className="text-xs text-gray-400">{p.role_in_project}</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {isReevaluation && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{t('admin.reevaluationWarning')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={assigning || loadingPart}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assigning ? t('common.loading') : (isReevaluation ? t('admin.confirmReevaluate') : t('admin.confirmAssign'))}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 2: Assign Points ──────────────────────────────────────────────────────

type AssignFilter = 'pending' | 'evaluated' | 'all'

function AssignPointsTab() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [improvements, setImprovements] = useState<PendingImprovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AssignFilter>('pending')
  const [pointConfig, setPointConfig] = useState<Record<SQDCMCategory, PointConfigRow>>(
    () =>
      Object.fromEntries(CATEGORIES.map((c) => [c, { high: 10, medium: 5 }])) as Record<
        SQDCMCategory,
        PointConfigRow
      >,
  )
  const [selectedImprovement, setSelectedImprovement] = useState<PendingImprovement | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [participationPoints, setParticipationPoints] = useState(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: ps } = await supabase
        .from('point_settings')
        .select('participation_points')
        .limit(1)
        .maybeSingle()
      if (ps) setParticipationPoints(ps.participation_points as number)

      const { data: configData } = await supabase.from('sqdcm_point_config').select('*')
      if (configData && configData.length > 0) {
        const updated = Object.fromEntries(
          CATEGORIES.map((c) => [c, { high: 10, medium: 5 }]),
        ) as Record<SQDCMCategory, PointConfigRow>
        for (const row of configData as SQDCMPointConfig[]) {
          if (CATEGORIES.includes(row.category)) {
            if (row.impact_level === 'high') updated[row.category].high = row.points
            else if (row.impact_level === 'medium') updated[row.category].medium = row.points
          }
        }
        setPointConfig(updated)
      }

      const { data: improvData, error: improvError } = await supabase
        .from('improvements')
        .select('*')
        .in('status', ['approved', 'implemented'])
        .order('updated_at', { ascending: false })

      if (improvError) throw improvError
      setImprovements((improvData ?? []) as PendingImprovement[])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAssigned = () => {
    setSuccessMsg(t('admin.pointsAssigned'))
    setTimeout(() => setSuccessMsg(null), 3000)
    loadData()
  }

  const filtered = useMemo(() => {
    if (filter === 'pending') return improvements.filter(i => !i.evaluated_at)
    if (filter === 'evaluated') return improvements.filter(i => !!i.evaluated_at)
    return improvements
  }, [improvements, filter])

  const counts = useMemo(() => ({
    pending: improvements.filter(i => !i.evaluated_at).length,
    evaluated: improvements.filter(i => !!i.evaluated_at).length,
    all: improvements.length,
  }), [improvements])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        {t('common.loading')}
      </div>
    )
  }

  const handleReevaluate = (imp: PendingImprovement) => {
    if (!confirm(t('admin.confirmReevaluatePrompt'))) return
    setSelectedImprovement(imp)
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} />
          {successMsg}
        </div>
      )}

      <div className="flex items-center gap-2">
        {(['pending', 'evaluated', 'all'] as AssignFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t(`admin.filter.${f}`)} ({counts[f]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          {t('common.none')}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(imp => {
            const evaluated = !!imp.evaluated_at
            const impacts: SQDCMImpact[] = Array.isArray(imp.sqdcm_impact) ? imp.sqdcm_impact : []
            const activeImpacts = impacts.filter(i => i.impact_level !== 'none')
            const total = activeImpacts.reduce(
              (s, i) => s + impactPoints(i.impact_level, i.category, pointConfig),
              0,
            )

            return (
              <div
                key={imp.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">{imp.title}</p>
                    {evaluated ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <CheckCircle size={11} />
                        {t('admin.evaluated')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {t('admin.pendingEvaluation')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{imp.area}</p>
                  {evaluated && activeImpacts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                      {activeImpacts.map((item, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            item.impact_level === 'high'
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-yellow-50 text-yellow-700 border border-yellow-100'
                          }`}
                        >
                          <span className="font-bold">{item.category}</span>
                          {' — '}
                          {t(`sqdcm.impact.${item.impact_level}`)}
                        </span>
                      ))}
                      <span className="text-xs font-bold text-blue-700 ml-1">{total} pts</span>
                    </div>
                  )}
                </div>
                {evaluated ? (
                  <button
                    onClick={() => handleReevaluate(imp)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium shadow-sm hover:bg-amber-600 transition-colors"
                  >
                    <RotateCcw size={14} />
                    {t('admin.reevaluate')}
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedImprovement(imp)}
                    className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    {t('admin.evaluateAndAssign')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedImprovement && (
        <AssignModal
          improvement={selectedImprovement}
          pointConfig={pointConfig}
          evaluatorId={profile?.id ?? null}
          defaultParticipationPoints={participationPoints}
          onClose={() => setSelectedImprovement(null)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  )
}

// ─── Tab 3: Update Status ──────────────────────────────────────────────────────

interface StatusRow {
  id: string
  title: string
  status: ImprovementStatus
  newStatus: ImprovementStatus
}

function UpdateStatusTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<StatusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadImprovements() {
      setLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from('improvements')
          .select('id, title, status')
          .in('status', ['submitted', 'under_review'])
          .order('updated_at', { ascending: false })

        if (fetchError) throw fetchError

        setRows(
          ((data ?? []) as Pick<Improvement, 'id' | 'title' | 'status'>[]).map((r) => ({
            ...r,
            newStatus: r.status,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    loadImprovements()
  }, [])

  const handleStatusChange = (id: string, status: ImprovementStatus) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, newStatus: status } : r)))
  }

  const handleSave = async (row: StatusRow) => {
    setSaving(row.id)
    setError(null)
    try {
      const { error: updateError } = await supabase
        .from('improvements')
        .update({ status: row.newStatus })
        .eq('id', row.id)

      if (updateError) throw updateError

      setSavedIds((prev) => new Set(prev).add(row.id))
      setTimeout(() => setSavedIds((prev) => { const next = new Set(prev); next.delete(row.id); return next }), 2500)

      // If newly moved out of submitted/under_review, remove from list
      if (row.newStatus !== 'submitted' && row.newStatus !== 'under_review') {
        setRows((prev) => prev.filter((r) => r.id !== row.id))
      } else {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: row.newStatus } : r))
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          {t('common.none')}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('admin.improvement')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.status')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 max-w-xs truncate">{row.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t(`status.${row.status}`)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={row.newStatus}
                      onChange={(e) => handleStatusChange(row.id, e.target.value as ImprovementStatus)}
                      className="block w-44 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {t(`status.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {savedIds.has(row.id) && (
                        <CheckCircle size={16} className="text-green-500" />
                      )}
                      <button
                        onClick={() => handleSave(row)}
                        disabled={saving === row.id || row.newStatus === row.status}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {saving === row.id ? t('common.loading') : t('common.save')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Award Form Modal ──────────────────────────────────────────────────────────

interface AwardFormState {
  name: string
  description: string
  point_cost: string
  image_url: string
  stock: string
  active: boolean
}

const EMPTY_AWARD_FORM: AwardFormState = {
  name: '',
  description: '',
  point_cost: '',
  image_url: '',
  stock: '',
  active: true,
}

function AwardFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Award | null
  onClose: () => void
  onSaved: (award: Award) => void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<AwardFormState>(
    initial
      ? {
          name: initial.name,
          description: initial.description,
          point_cost: String(initial.point_cost),
          image_url: initial.image_url,
          stock: initial.stock === null ? '' : String(initial.stock),
          active: initial.active,
        }
      : EMPTY_AWARD_FORM
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    const path = `${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('awards').upload(path, file)
    if (uploadError) {
      setError(uploadError.message)
    } else {
      const { data } = supabase.storage.from('awards').getPublicUrl(path)
      setForm((prev) => ({ ...prev, image_url: data.publicUrl }))
    }
    setUploading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cost = parseInt(form.point_cost, 10)
    if (!form.name.trim() || !cost || cost <= 0) {
      setError(t('common.required') as string)
      return
    }
    const stockValue = form.stock.trim() === '' ? null : parseInt(form.stock, 10)
    if (stockValue !== null && (Number.isNaN(stockValue) || stockValue < 0)) {
      setError(t('common.required') as string)
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      point_cost: cost,
      image_url: form.image_url,
      stock: stockValue,
      active: form.active,
    }

    if (initial?.id) {
      const { data, error: updateError } = await supabase
        .from('awards')
        .update(payload)
        .eq('id', initial.id)
        .select()
        .single()
      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
      onSaved(data as Award)
    } else {
      const { data, error: insertError } = await supabase
        .from('awards')
        .insert(payload)
        .select()
        .single()
      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }
      onSaved(data as Award)
    }
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {initial ? t('admin.editAward') : t('admin.newAward')}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.awardName')}<span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.awardDescription')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('admin.awardCost')}<span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={form.point_cost}
                onChange={(e) => setForm((p) => ({ ...p, point_cost: e.target.value }))}
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('admin.awardStock')}
              </label>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))}
                placeholder="∞"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.awardImage')}
            </label>
            <div className="flex items-start gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                <Upload size={14} />
                {uploading ? t('common.loading') : t('common.add')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file)
                  }}
                />
              </label>
              {form.image_url && (
                <img
                  src={form.image_url}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                />
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{t('admin.awardActive')}</span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab 4: Awards Management ─────────────────────────────────────────────────

function AwardsTab() {
  const { t } = useTranslation()
  const [awards, setAwards] = useState<Award[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editAward, setEditAward] = useState<Award | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('awards')
      .select('*')
      .order('created_at', { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setAwards((data ?? []) as Award[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const handleSaved = (award: Award) => {
    setAwards((prev) => {
      const idx = prev.findIndex((a) => a.id === award.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = award
        return next
      }
      return [award, ...prev]
    })
  }

  const handleDelete = async (award: Award) => {
    if (!confirm(t('admin.deleteAwardConfirm') as string)) return
    const { error: deleteError } = await supabase.from('awards').delete().eq('id', award.id)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      setAwards((prev) => prev.filter((a) => a.id !== award.id))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => { setEditAward(null); setShowForm(true) }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          {t('admin.newAward')}
        </button>
      </div>

      {awards.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          {t('awards.noAwards')}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('admin.awardName')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('admin.awardCost')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('awards.stock')}
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('admin.awardActive')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {awards.map((award) => (
                <tr key={award.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                        {award.image_url ? (
                          <img src={award.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Gift size={16} className="text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{award.name}</p>
                        {award.description && (
                          <p className="text-xs text-gray-500 truncate max-w-xs">{award.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-blue-700">
                    {award.point_cost}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-600">
                    {award.stock === null ? t('awards.unlimited') : award.stock}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {award.active ? (
                      <CheckCircle size={16} className="text-green-500 inline" />
                    ) : (
                      <span className="text-xs text-gray-400">{t('awards.inactive')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditAward(award); setShowForm(true) }}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(award)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <AwardFormModal
          initial={editAward}
          onClose={() => { setShowForm(false); setEditAward(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ─── Redemption Form Modal ─────────────────────────────────────────────────────

function RedemptionFormModal({
  users,
  awards,
  onClose,
  onSaved,
}: {
  users: User[]
  awards: Award[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [userId, setUserId] = useState('')
  const [awardId, setAwardId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedUser = users.find((u) => u.id === userId)
  const selectedAward = awards.find((a) => a.id === awardId)
  const insufficient =
    selectedUser && selectedAward && selectedUser.total_points < selectedAward.point_cost
  const outOfStock = selectedAward && selectedAward.stock !== null && selectedAward.stock <= 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || !selectedAward) return
    if (insufficient || outOfStock) return

    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('award_redemptions').insert({
      award_id: selectedAward.id,
      user_id: selectedUser.id,
      points_spent: selectedAward.point_cost,
      status: 'pending',
      notes: notes.trim(),
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{t('admin.newRedemption')}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.selectUser')}<span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.total_points} {t('common.points').toLowerCase()})
                </option>
              ))}
            </select>
          </div>

          {selectedUser && (
            <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-sm">
              <span className="text-blue-800">{t('admin.userBalance')}</span>
              <span className="font-bold text-blue-700">
                {selectedUser.total_points} {t('common.points').toLowerCase()}
              </span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.selectAward')}<span className="text-red-500 ml-1">*</span>
            </label>
            <select
              value={awardId}
              onChange={(e) => setAwardId(e.target.value)}
              required
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">—</option>
              {awards.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.active}>
                  {a.name} — {a.point_cost} {t('common.points').toLowerCase()}
                  {a.stock !== null && ` (${a.stock})`}
                </option>
              ))}
            </select>
          </div>

          {insufficient && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              {t('admin.notEnoughPoints')}
            </div>
          )}
          {outOfStock && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              {t('admin.outOfStockShort')}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('admin.notes')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !selectedUser || !selectedAward || !!insufficient || !!outOfStock}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab 5: Redemptions ───────────────────────────────────────────────────────

function RedemptionsTab() {
  const { t } = useTranslation()
  const [redemptions, setRedemptions] = useState<AwardRedemption[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [awards, setAwards] = useState<Award[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState<RedemptionStatus | 'all'>('all')
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: redData, error: redErr }, { data: userData }, { data: awardData }] =
      await Promise.all([
        supabase
          .from('award_redemptions')
          .select('*, award:awards(name,image_url), user:users(name,area,total_points,spent_points)')
          .order('created_at', { ascending: false }),
        supabase.from('users').select('*').order('name', { ascending: true }),
        supabase.from('awards').select('*').order('name', { ascending: true }),
      ])
    if (redErr) {
      setError(redErr.message)
    } else {
      setRedemptions((redData ?? []) as AwardRedemption[])
    }
    setUsers((userData ?? []) as User[])
    setAwards((awardData ?? []) as Award[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const handleStatusChange = async (red: AwardRedemption, status: RedemptionStatus) => {
    const patch: { status: RedemptionStatus; fulfilled_at?: string } = { status }
    if (status === 'fulfilled') patch.fulfilled_at = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('award_redemptions')
      .update(patch)
      .eq('id', red.id)
    if (updateError) {
      setError(updateError.message)
    } else {
      load()
    }
  }

  const handleSaved = () => {
    setSavedMsg(t('admin.redemptionRecorded') as string)
    setTimeout(() => setSavedMsg(null), 2500)
    load()
  }

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return redemptions
    return redemptions.filter((r) => r.status === statusFilter)
  }, [redemptions, statusFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error}
        </div>
      )}
      {savedMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} />
          {savedMsg}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {(['all', 'pending', 'fulfilled', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s === 'all' ? t('common.all') : t(`redemption.${s}`)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          {t('admin.newRedemption')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-400 bg-white rounded-xl border border-gray-200">
          {t('admin.noRedemptions')}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.date')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('admin.awardName')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.points')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.status')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{r.user?.name ?? r.user_id}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{r.award?.name ?? r.award_id}</td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-blue-700">
                    {r.points_spent}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : r.status === 'fulfilled'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {t(`redemption.${r.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {r.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleStatusChange(r, 'fulfilled')}
                          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors"
                        >
                          {t('admin.markFulfilled')}
                        </button>
                        <button
                          onClick={() => handleStatusChange(r, 'cancelled')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          {t('admin.cancelRedemption')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <RedemptionFormModal
          users={users}
          awards={awards.filter((a) => a.active)}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ─── Main Admin Page ───────────────────────────────────────────────────────────

type AdminTab = 'config' | 'assign' | 'status' | 'awards' | 'redemptions'

export default function Admin() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<AdminTab>('config')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('admin.title')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')}>
          {t('admin.pointConfig')}
        </TabButton>
        <TabButton active={activeTab === 'assign'} onClick={() => setActiveTab('assign')}>
          {t('admin.assignPoints')}
        </TabButton>
        <TabButton active={activeTab === 'status'} onClick={() => setActiveTab('status')}>
          {t('admin.updateStatus')}
        </TabButton>
        <TabButton active={activeTab === 'awards'} onClick={() => setActiveTab('awards')}>
          {t('admin.awardsSection')}
        </TabButton>
        <TabButton active={activeTab === 'redemptions'} onClick={() => setActiveTab('redemptions')}>
          {t('admin.redemptionsSection')}
        </TabButton>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'config' && <PointConfigTab />}
        {activeTab === 'assign' && <AssignPointsTab />}
        {activeTab === 'status' && <UpdateStatusTab />}
        {activeTab === 'awards' && <AwardsTab />}
        {activeTab === 'redemptions' && <RedemptionsTab />}
      </div>
    </div>
  )
}
