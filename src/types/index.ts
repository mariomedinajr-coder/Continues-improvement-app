export type SQDCMCategory = 'S' | 'Q' | 'D' | 'C' | 'M'
export type ImpactLevel = 'high' | 'medium' | 'none'
export type ImprovementStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'implemented' | 'rejected'
export type RootCauseMethod = '5whys' | 'ishikawa'
export type UserRole = 'admin' | 'manager' | 'viewer'

export interface User {
  id: string
  name: string
  area: string
  job_title: string
  seniority: string
  employee_number: string
  email: string | null
  role: UserRole
  auth_id: string | null
  is_active: boolean
  total_points: number
  spent_points: number
  team_id: string | null
  created_at: string
}

export interface Team {
  id: string
  name: string
  area: string
  created_at: string
}

export interface StatusHistoryEntry {
  id: string
  improvement_id: string
  from_status: ImprovementStatus | null
  to_status: ImprovementStatus
  changed_by: string | null
  comment: string
  created_at: string
}

export interface SQDCMPointConfig {
  id: string
  category: SQDCMCategory
  impact_level: 'high' | 'medium'
  points: number
}

export interface SQDCMImpact {
  category: SQDCMCategory
  description: string
  impact_level: ImpactLevel
}

export interface FiveWhy {
  question: string
  answer: string
}

export interface IshikawaCause {
  branch: string
  cause: string
}

export interface Solution {
  label: string
  description: string
  impact: number
  ease: number
  cost: number
  risk: number
}

export interface ResultIndicator {
  name: string
  before: string
  after: string
  improvement: string
}

export interface Improvement {
  id: string
  title: string
  area: string
  date_submitted: string
  status: ImprovementStatus
  // Step 2 - Problem
  problem_description: string
  sqdcm_targeted: SQDCMCategory[]
  expected_objective: string
  problem_impact: string
  // Step 3 - Current vs Desired
  current_state: string[]
  desired_state: string[]
  // Step 5 - Root Cause
  root_cause_method: RootCauseMethod
  five_whys: FiveWhy[]
  ishikawa_causes: IshikawaCause[]
  // Step 6 - Solutions
  solutions: Solution[]
  chosen_solution: string
  // Step 7 - Development
  dev_planning: string
  dev_resources: string
  dev_implementation: string
  dev_followup: string
  // Step 9 - Before/After images
  before_images: string[]
  after_images: string[]
  // Step 10 - Results
  result_indicators: ResultIndicator[]
  new_standards: string[]
  // Step 11 - SQDCM Impact
  sqdcm_impact: SQDCMImpact[]         // authoritative (set by manager)
  submitter_impact: SQDCMImpact[]     // submitter's suggestion (form Step 10)
  evaluated_by: string | null
  evaluated_at: string | null
  // Step 12 - PDCA
  pdca_plan: string
  pdca_do: string
  pdca_check: string
  pdca_act: string
  next_steps_responsible: string
  next_steps_date: string
  next_steps_followup: string
  // Meta
  created_by: string
  created_at: string
  updated_at: string
  total_points?: number
}

export interface ImprovementParticipant {
  id: string
  improvement_id: string
  user_id: string
  role_in_project: string
  user?: User
}

export interface PointAssignment {
  id: string
  improvement_id: string
  user_id: string
  points: number
  assigned_by: string
  created_at: string
  user?: User
}

export interface LeaderboardEntry {
  user_id: string
  user_name: string
  area: string
  total_points: number
  improvements_count: number
  rank: number
}

export interface TeamMemberContribution {
  user_id: string
  user_name: string
  total_points: number
  improvements_count: number
}

export interface TeamLeaderboardEntry {
  team_id: string
  team_name: string
  area: string
  total_points: number
  members_count: number
  improvements_count: number
  rank: number
  members: TeamMemberContribution[]
}

export type RedemptionStatus = 'pending' | 'fulfilled' | 'cancelled'

export interface Award {
  id: string
  name: string
  description: string
  point_cost: number
  image_url: string
  stock: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface AwardRedemption {
  id: string
  award_id: string
  user_id: string
  points_spent: number
  status: RedemptionStatus
  notes: string
  created_at: string
  fulfilled_at: string | null
  award?: Award
  user?: User
}

export type ForumCriterion = 'impacto' | 'viabilidad' | 'urgencia' | 'alineacion' | 'costo'

export interface ForumEvaluation {
  id: string
  improvement_id: string
  evaluator_id: string
  impacto: number
  viabilidad: number
  urgencia: number
  alineacion: number
  costo: number
  comment: string
  created_at: string
  updated_at: string
}

export interface ForumRankingEntry {
  improvement_id: string
  title: string
  area: string
  avg_score: number
  evaluator_count: number
  rank: number
  is_top: boolean
}

export interface PointSettings {
  id: string
  participation_points: number
  updated_at: string
}
