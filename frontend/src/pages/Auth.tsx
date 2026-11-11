import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../supabase'

type Mode = 'signin' | 'signup'

const inputClass =
  'w-full bg-surface-container rounded-lg text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-variant transition-colors'

function passwordMeetsPolicy(password: string) {
  return password.length >= 8 && /[^A-Za-z0-9]/.test(password)
}

function Auth() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
    setShowPassword(false)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in frontend/.env and restart the dev server.')
      return
    }

    if (mode === 'signup') {
      if (!passwordMeetsPolicy(password)) {
        setError('Password must contain at least 8 characters and 1 symbol.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    } else if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        navigate('/dashboard', { replace: true })
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() || undefined },
          },
        })

        if (error) throw error

        if (data.session) {
          navigate('/dashboard', { replace: true })
        } else {
          setNotice('Account created! Check your email to confirm your address, then sign in.')
          setMode('signin')
          setPassword('')
          setConfirmPassword('')
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const policyMet = passwordMeetsPolicy(password)
  const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== password
  const tabClass = (active: boolean) =>
    `flex-1 py-2.5 text-center font-headline-sm text-headline-sm rounded-lg transition-all duration-200 ${
      active
        ? 'bg-surface-container text-on-surface shadow-md'
        : 'text-outline hover:text-on-surface'
    }`

  return (
    <div className="min-h-screen bg-background font-body-md text-body-md text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container flex flex-col justify-center">
      <main className="w-full flex-1 flex flex-col justify-center items-center">
        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-16">
          <div className="absolute top-1/4 left-10 w-96 h-96 bg-secondary-container/20 rounded-full blur-3xl pointer-events-none -z-10" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary-container/15 rounded-full blur-3xl pointer-events-none -z-10" />
          <div className="absolute top-1/2 left-1/3 w-80 h-80 bg-tertiary-container/10 rounded-full blur-3xl pointer-events-none -z-10" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-8 relative">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-3.5">
                  <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-surface-container-high p-1 shadow-lg shadow-black/40">
                    <DocMindMark />
                    <div className="absolute inset-0 rounded-xl bg-primary/10 pointer-events-none" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-md text-headline-md text-on-background flex items-center gap-2">
                      DocMind
                      <span className="font-label-sm text-label-sm uppercase px-2 py-0.5 rounded-full bg-secondary-container/40 text-secondary">
                        v2.4 Neural
                      </span>
                    </span>
                    <span className="font-label-sm text-label-sm text-outline">
                      Document Intelligence Engine
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <h1 className="font-display-hero text-display-hero-mobile sm:text-display-hero text-on-surface">
                    Chat with your{' '}
                    <span className="bg-gradient-to-r from-primary via-secondary to-tertiary-fixed bg-clip-text text-transparent">
                      documents
                    </span>
                    .
                  </h1>
                  <p className="font-body-lg text-body-lg text-on-surface-variant max-w-lg mt-3 leading-relaxed">
                    Turn static PDFs, notes, and research into dynamic intelligence. Extract insights, cite sources, and query your knowledge base instantly.
                  </p>
                </div>
              </div>

              <div className="relative w-full rounded-2xl bg-surface-container-lowest/80 p-6 overflow-hidden shadow-2xl backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-container/10 via-surface-container-low/50 to-secondary-container/20 pointer-events-none" />
                <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
                <div className="relative z-10 flex flex-col space-y-4">
                  <div className="flex items-center justify-between pb-3">
                    <div className="flex items-center space-x-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tertiary" />
                      </span>
                      <span className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">
                        Neural Context Stream active
                      </span>
                    </div>
                    <span className="font-code-inline text-code-inline text-outline text-xs">
                      latency: 14ms
                    </span>
                  </div>

                  <div className="flex items-start space-x-3.5 p-3.5 rounded-xl bg-surface-container/70 backdrop-blur-md transition-all hover:bg-surface-container">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shadow-inner">
                      <span className="material-symbols-outlined text-[20px]">description</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-headline-sm text-headline-sm text-on-surface truncate">
                          leave_policy_2025.pdf
                        </p>
                        <span className="font-label-sm text-label-sm text-tertiary bg-tertiary-container/20 px-2 py-0.5 rounded shrink-0">
                          98% precision
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                        38 pages indexed • Vector chunks: 312 • Synced
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3.5 p-3.5 rounded-xl bg-surface-container/70 backdrop-blur-md transition-all hover:bg-surface-container">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-secondary-container/30 flex items-center justify-center text-secondary">
                      <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-headline-sm text-headline-sm text-on-surface truncate">
                          Extracted 14 key provisions
                        </p>
                        <span className="font-code-inline text-code-inline text-on-secondary-container bg-surface-variant/60 px-2 py-0.5 rounded shrink-0">
                          p. 12-19
                        </span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 italic">
                        “Maternity & parental leave extended to 24 weeks with full vesting schedule...”
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col">
                      <span className="font-label-sm text-label-sm text-outline">Accuracy</span>
                      <span className="font-headline-md text-headline-md text-primary mt-0.5">99.4%</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col">
                      <span className="font-label-sm text-label-sm text-outline">Sources Cited</span>
                      <span className="font-headline-md text-headline-md text-secondary mt-0.5">14,280</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col">
                      <span className="font-label-sm text-label-sm text-outline">Synthesized</span>
                      <span className="font-headline-md text-headline-md text-tertiary mt-0.5">1.8s</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-outline">
                <div className="flex items-center space-x-1.5">
                  <span className="material-symbols-outlined text-sm">verified_user</span>
                  <span className="font-label-sm text-label-sm">SOC-2 Type II Certified</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="material-symbols-outlined text-sm">lock</span>
                  <span className="font-label-sm text-label-sm">Zero Data Retention for LLM training</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 w-full max-w-xl mx-auto">
              <div className="relative rounded-2xl bg-surface-container-low/95 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl shadow-black/80">
                <div className="flex items-center p-1 rounded-xl bg-surface-container-lowest mb-6" role="tablist" aria-label="Authentication mode">
                  <button
                    className={tabClass(mode === 'signin')}
                    id="tab-login"
                    role="tab"
                    aria-selected={mode === 'signin'}
                    type="button"
                    onClick={() => switchMode('signin')}
                  >
                    Log in
                  </button>
                  <button
                    className={tabClass(mode === 'signup')}
                    id="tab-signup"
                    role="tab"
                    aria-selected={mode === 'signup'}
                    type="button"
                    onClick={() => switchMode('signup')}
                  >
                    Sign up
                  </button>
                </div>

                <form className="flex flex-col space-y-4" onSubmit={handleSubmit}>
                  {mode === 'signin' ? (
                    <>
                      <div className="flex flex-col space-y-1.5">
                        <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="login-email">
                          Work Email
                        </label>
                        <div className="relative flex items-center">
                          <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
                            mail
                          </span>
                          <input
                            className={`${inputClass} pl-11 pr-4 py-2.5`}
                            id="login-email"
                            placeholder="alex@acme.ai"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                          />
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="login-password">
                            Password
                          </label>
                          <button
                            className="font-label-sm text-label-sm text-primary hover:text-primary-fixed-dim transition-colors"
                            type="button"
                          >
                            Forgot password?
                          </button>
                        </div>
                        <div className="relative flex items-center">
                          <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
                            lock
                          </span>
                          <input
                            className={`${inputClass} pl-11 pr-12 py-2.5`}
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                          />
                          <button
                            className="absolute right-3.5 text-outline hover:text-on-surface transition-colors focus:outline-none flex items-center"
                            type="button"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            onClick={() => setShowPassword((visible) => !visible)}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {showPassword ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          className="w-4 h-4 rounded bg-surface-container text-primary-container accent-primary-container focus:ring-0 focus:outline-none cursor-pointer"
                          id="remember-me"
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                        />
                        <label className="font-body-sm text-body-sm text-on-surface-variant cursor-pointer" htmlFor="remember-me">
                          Remember this workstation for 30 days
                        </label>
                      </div>

                      {error && (
                        <p className="font-body-sm text-body-sm text-error" role="alert">
                          {error}
                        </p>
                      )}
                      {notice && (
                        <p className="font-body-sm text-body-sm text-tertiary" role="status">
                          {notice}
                        </p>
                      )}

                      <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                        <button
                          className="w-full flex-1 py-3 px-5 rounded-lg bg-gradient-to-r from-primary-container via-primary-container to-secondary-container hover:opacity-95 text-on-primary-container font-headline-sm text-headline-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-primary-container/20 active:scale-[0.99] disabled:opacity-70"
                          type="submit"
                          disabled={loading}
                        >
                          <span>{loading ? 'Please wait…' : 'Log in to DocMind'}</span>
                          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                        <div className="hidden sm:flex items-center space-x-2 px-3 py-2.5 rounded-lg bg-surface-container text-outline" title="System streaming simulation">
                          <svg className="animate-spin h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor" />
                          </svg>
                          <span className="font-label-sm text-label-sm">Encrypted Auth</span>
                        </div>
                      </div>

                      <div className="relative py-2 flex items-center justify-center">
                        <div className="w-full bg-surface-variant h-px" />
                        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline px-3 bg-surface-container-low absolute">
                          or continue with
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <button className="flex items-center justify-center py-2.5 px-3 rounded-lg bg-surface-container hover:bg-surface-variant transition-colors" type="button">
                          <GoogleIcon />
                          <span className="font-label-md text-label-md text-on-surface">Google</span>
                        </button>
                        <button className="flex items-center justify-center py-2.5 px-3 rounded-lg bg-surface-container hover:bg-surface-variant transition-colors" type="button">
                          <GitHubIcon />
                          <span className="font-label-md text-label-md text-on-surface">GitHub</span>
                        </button>
                        <button className="flex items-center justify-center py-2.5 px-3 rounded-lg bg-surface-container hover:bg-surface-variant transition-colors" type="button">
                          <OfficeIcon />
                          <span className="font-label-md text-label-md text-on-surface">Office</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col space-y-1">
                          <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="signup-name">
                            Full Name
                          </label>
                          <input
                            className={`${inputClass} px-3.5 py-2`}
                            id="signup-name"
                            placeholder="Elena Rostova"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            autoComplete="name"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="signup-email">
                            Work Email
                          </label>
                          <input
                            className={`${inputClass} px-3.5 py-2`}
                            id="signup-email"
                            placeholder="elena@research.org"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                          />
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1">
                        <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="signup-pass">
                          Create Password
                        </label>
                        <div className="relative flex items-center">
                          <input
                            className={`${inputClass} px-3.5 py-2 pr-10`}
                            id="signup-pass"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                          />
                          {policyMet && (
                            <span className="material-symbols-outlined absolute right-3 text-tertiary text-[18px]">
                              check_circle
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-1.5 pt-0.5">
                          {policyMet && (
                            <span className="material-symbols-outlined text-tertiary text-xs">done</span>
                          )}
                          <span className={`font-label-sm text-label-sm ${policyMet ? 'text-tertiary' : 'text-outline'}`}>
                            Must contain at least 8 characters and 1 symbol
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1">
                        <label
                          className={`font-label-md text-label-md ${passwordsMismatch ? 'text-error' : 'text-on-surface-variant'}`}
                          htmlFor="signup-pass-confirm"
                        >
                          Confirm Password
                        </label>
                        <div className="relative flex items-center">
                          <input
                            className={`${inputClass} px-3.5 py-2 pr-10 ${
                              passwordsMismatch ? 'bg-error-container/20 text-error' : ''
                            }`}
                            id="signup-pass-confirm"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                          />
                          {passwordsMismatch && (
                            <span className="material-symbols-outlined absolute right-3 text-error text-[18px]">
                              error
                            </span>
                          )}
                        </div>
                        {passwordsMismatch && (
                          <div className="flex items-center space-x-1.5 pt-0.5">
                            <span className="font-label-sm text-label-sm text-error">Passwords do not match</span>
                          </div>
                        )}
                      </div>

                      {error && (
                        <p className="font-body-sm text-body-sm text-error" role="alert">
                          {error}
                        </p>
                      )}

                      <button
                        className="w-full py-3 px-5 rounded-lg bg-gradient-to-r from-primary-container via-primary-container to-secondary-container hover:opacity-95 text-on-primary-container font-headline-sm text-headline-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-primary-container/20 mt-1 active:scale-[0.99] disabled:opacity-70"
                        type="submit"
                        disabled={loading}
                      >
                        <span>{loading ? 'Please wait…' : 'Create Workspace Account'}</span>
                        <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                      </button>
                    </>
                  )}
                </form>

                <div className="pt-6 mt-6 border-t border-surface-variant/40 text-center">
                  <p className="font-body-sm text-body-sm text-outline">
                    By signing in, you agree to DocMind&apos;s{' '}
                    <a className="text-on-surface hover:underline" href="#terms" onClick={(e) => e.preventDefault()}>
                      Terms of Service
                    </a>{' '}
                    &{' '}
                    <a className="text-on-surface hover:underline" href="#privacy" onClick={(e) => e.preventDefault()}>
                      Privacy Policy
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function DocMindMark() {
  return (
    <svg viewBox="0 0 48 48" className="w-full h-full" fill="none" aria-hidden="true">
      <rect x="6" y="4" width="28" height="36" rx="6" fill="#4d8eff" />
      <path d="M14 16h12M14 22h12M14 28h7" stroke="#00285d" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="10" fill="#131b2e" stroke="#4edea3" strokeWidth="2" />
      <path d="M27.5 32.2l3 3 5.5-6" stroke="#4edea3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" fill="#4285F4" />
      <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.27 21.43 7.34 24 12 24z" fill="#34A853" />
      <path d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.13z" fill="#FBBC05" />
      <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.27 2.57 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z" fill="#EA4335" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4 mr-2 fill-on-surface" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
}

function OfficeIcon() {
  return (
    <svg className="w-4 h-4 mr-2" viewBox="0 0 23 23" aria-hidden="true">
      <path d="M1 1h10v10H1z" fill="#f35325" />
      <path d="M12 1h10v10H12z" fill="#81bc06" />
      <path d="M1 12h10v10H1z" fill="#05a6f0" />
      <path d="M12 12h10v10H12z" fill="#ffba08" />
    </svg>
  )
}

export default Auth
