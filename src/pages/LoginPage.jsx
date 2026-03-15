import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
    const { login, register, loginWithGoogle } = useAuth()
    const navigate = useNavigate()
    const [mode, setMode] = useState('login') // login | register
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            if (mode === 'login') {
                await login(email, password)
            } else {
                await register(email, password, name)
            }
            navigate('/patient')
        } catch (err) {
            setError(err.message || 'Authentication failed')
        } finally {
            setLoading(false)
        }
    }

    async function handleGoogle() {
        setError('')
        setLoading(true)
        try {
            await loginWithGoogle()
            navigate('/patient')
        } catch (err) {
            setError(err.message || 'Google sign-in failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            position: 'relative',
            overflow: 'hidden',
        }}>
            <div className="mesh-bg" />

            {/* Ambient orbs */}
            <div style={{
                position: 'absolute', top: '-10%', right: '-5%',
                width: 500, height: 500, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(14,94,79,0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', bottom: '-10%', left: '-5%',
                width: 400, height: 400, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(200,169,81,0.08) 0%, transparent 70%)',
                pointerEvents: 'none',
            }} />

            <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
                {/* Logo + header */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: 18,
                        background: 'linear-gradient(135deg, var(--emerald), #1a8a72)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                        border: '1px solid rgba(200,169,81,0.4)',
                        boxShadow: '0 8px 32px rgba(14,94,79,0.35)',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: 6 }}>
                        <span className="text-gold">NeuroGuard</span> AI
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        AI-Powered Stroke Rehabilitation Platform
                    </p>
                </div>

                {/* Card */}
                <div className="glass-card" style={{ padding: 32 }}>
                    {/* Mode tabs */}
                    <div style={{
                        display: 'flex', background: 'rgba(255,255,255,0.04)',
                        borderRadius: 8, padding: 3, marginBottom: 24,
                    }}>
                        {['login', 'register'].map(m => (
                            <button key={m} onClick={() => { setMode(m); setError('') }}
                                style={{
                                    flex: 1, padding: '8px 0',
                                    background: mode === m ? 'rgba(200,169,81,0.15)' : 'transparent',
                                    border: mode === m ? '1px solid var(--border-gold)' : '1px solid transparent',
                                    borderRadius: 6, color: mode === m ? 'var(--gold)' : 'var(--text-muted)',
                                    cursor: 'pointer', fontFamily: 'var(--font-display)',
                                    fontWeight: 600, fontSize: '0.85rem', transition: 'all var(--transition)',
                                    textTransform: 'capitalize',
                                }}
                            >{m === 'login' ? 'Sign In' : 'Register'}</button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {mode === 'register' && (
                            <div>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Full Name</label>
                                <input className="input-gold" type="text" placeholder="Dr. Jane Smith" value={name} onChange={e => setName(e.target.value)} required />
                            </div>
                        )}
                        <div>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Email</label>
                            <input className="input-gold" type="email" placeholder="name@hospital.com" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Password</label>
                            <input className="input-gold" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>

                        {error && (
                            <div style={{
                                background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)',
                                borderRadius: 8, padding: '10px 14px',
                                color: 'var(--danger)', fontSize: '0.85rem',
                            }}>
                                {error}
                            </div>
                        )}

                        <button className="btn-gold" type="submit" disabled={loading} style={{ marginTop: 4, width: '100%', padding: '13px 0', fontSize: '0.95rem' }}>
                            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>or continue with</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
                    </div>

                    {/* Google */}
                    <button onClick={handleGoogle} disabled={loading} style={{
                        width: '100%', padding: '12px 0',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 8, color: 'var(--text-primary)',
                        cursor: 'pointer', fontFamily: 'var(--font-display)',
                        fontWeight: 600, fontSize: '0.9rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        transition: 'all var(--transition)',
                    }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-gold)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Sign in with Google
                    </button>
                </div>

                <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    © 2026 NeuroGuard AI · Clinical Analytics Platform
                </p>
            </div>
        </div>
    )
}
