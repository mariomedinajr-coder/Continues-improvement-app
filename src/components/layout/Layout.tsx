import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, TrendingUp, PlusCircle, Trophy, ClipboardCheck, Settings, Users, UsersRound, Gift, Menu, X, Globe, LogOut,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import type { UserRole } from '../../types'

interface NavLink {
  to: string
  label: string
  icon: typeof LayoutDashboard
  roles?: UserRole[]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  const toggleLang = () => {
    const next = i18n.language === 'es' ? 'en' : 'es'
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
  }

  const allLinks: NavLink[] = [
    { to: '/',                label: t('nav.dashboard'),    icon: LayoutDashboard },
    { to: '/improvements',    label: t('nav.improvements'), icon: TrendingUp },
    { to: '/improvements/new',label: t('nav.submit'),       icon: PlusCircle },
    { to: '/leaderboard',     label: t('nav.leaderboard'),  icon: Trophy },
    { to: '/forum',           label: t('nav.forum'),        icon: ClipboardCheck, roles: ['admin', 'manager'] },
    { to: '/awards',          label: t('nav.awards'),       icon: Gift },
    { to: '/admin',           label: t('nav.admin'),        icon: Settings, roles: ['admin', 'manager'] },
    { to: '/users',           label: t('nav.users'),        icon: Users,    roles: ['admin'] },
    { to: '/teams',           label: t('nav.teams'),        icon: UsersRound, roles: ['admin'] },
  ]

  const links = allLinks.filter(l => !l.roles || (profile && l.roles.includes(profile.role)))

  const initials = profile?.name?.split(' ').map(p => p.charAt(0)).slice(0, 2).join('').toUpperCase() ?? '?'

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 fixed h-full z-30">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <TrendingUp size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm leading-tight">
            Mejora<br />Continua
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to) && to !== '/'
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User block */}
        {profile && (
          <div className="px-3 py-3 border-t border-gray-100 space-y-1">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate">{profile.name}</p>
                <p className="text-xs text-gray-400 truncate">{t(`auth.role.${profile.role}`)}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-700 w-full transition-colors"
            >
              <LogOut size={16} />
              {t('auth.signOut')}
            </button>
          </div>
        )}

        <div className="px-3 py-3 border-t border-gray-100">
          <button
            onClick={toggleLang}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 w-full"
          >
            <Globe size={16} />
            {i18n.language === 'es' ? 'English' : 'Español'}
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-30 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-sm">Mejora Continua</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleLang} className="p-2 text-gray-500">
            <Globe size={18} />
          </button>
          <button onClick={() => setOpen(!open)} className="p-2 text-gray-500">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-20 bg-black/30" onClick={() => setOpen(false)}>
          <div className="bg-white w-64 h-full shadow-xl pt-16 flex flex-col" onClick={e => e.stopPropagation()}>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {links.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  <Icon size={18} />
                  {label}
                </Link>
              ))}
            </nav>
            {profile && (
              <div className="border-t border-gray-100 p-3 space-y-1">
                <div className="flex items-center gap-3 px-2 py-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{profile.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t(`auth.role.${profile.role}`)}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setOpen(false); signOut() }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-700 w-full"
                >
                  <LogOut size={16} />
                  {t('auth.signOut')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
