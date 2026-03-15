import React, { useEffect, useState } from 'react'
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import Layout from '../components/Layout'
import { getPatientSessions } from '../firebase/firestore'
import { useAuth } from '../contexts/AuthContext'



const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) return (
        <div style={{ background: 'rgba(15,15,15,0.95)', border: '1px solid var(--border-gold)', borderRadius: 8, padding: '8px 14px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color, fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '0.85rem' }}>
                    {p.name}: {p.value}
                </p>
            ))}
        </div>
    )
    return null
}

export default function PatientHistory() {
    const { currentUser } = useAuth()
    const [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            if (!currentUser) return // wait for auth
            try {
                const data = await getPatientSessions(currentUser.uid, 10)
                setSessions(data)
            } catch (err) {
                console.error("Failed to load sessions:", err)
                setSessions([])
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [currentUser])

    const chartData = sessions.map((s, i) => ({
        date: new Date(s.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        // FIX Bug 3: fall back to peakTremorScore for sessions saved before this fix
        tremor: s.avgTremorScore ?? s.peakTremorScore ?? 0,
        stability: s.stabilityScore ?? 0,
        successRate: s.drinkSuccessRate ?? 0,
    }))

    const avgStability = sessions.length
        ? Math.round(sessions.reduce((a, b) => a + b.stabilityScore, 0) / sessions.length)
        : 0

    const latestImprovement = sessions.length >= 2
        ? (sessions[sessions.length - 1].stabilityScore - sessions[0].stabilityScore)
        : 0

    return (
        <Layout>
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                    My <span className="text-gold">Progress History</span>
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your rehabilitation journey over the last 10 sessions</p>
            </div>

            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
                {[
                    { label: 'Total Sessions', value: sessions.length, color: 'var(--gold)', icon: '📋' },
                    { label: 'Avg Stability', value: `${avgStability}%`, color: 'var(--success)', icon: '🎯' },
                    { label: 'Improvement', value: `${latestImprovement > 0 ? '+' : ''}${latestImprovement}`, color: latestImprovement >= 0 ? 'var(--success)' : 'var(--danger)', icon: '📈' },
                ].map(s => (
                    <div key={s.label} className="glass-card" style={{ padding: '18px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{s.icon}</div>
                        <div style={{ fontSize: '2rem', fontFamily: 'var(--font-display)', fontWeight: 900, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 14 }}>Tremor Score Over Time</h3>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" stroke="#5C5548" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#5C5548" tick={{ fontSize: 11 }} domain={[0, 100]} />
                            <Tooltip content={<CustomTooltip />} />
                            <Line type="monotone" dataKey="tremor" name="Tremor" stroke="#C8A951" strokeWidth={2.5} dot={{ fill: '#C8A951', r: 3 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 14 }}>Stability Improvement</h3>
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="stabGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0E5E4F" stopOpacity={0.5} />
                                    <stop offset="95%" stopColor="#0E5E4F" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" stroke="#5C5548" tick={{ fontSize: 11 }} />
                            <YAxis stroke="#5C5548" tick={{ fontSize: 11 }} domain={[0, 100]} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area type="monotone" dataKey="stability" name="Stability" stroke="#2EC87C" strokeWidth={2.5} fill="url(#stabGrad)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Session table */}
            <div className="glass-card" style={{ padding: '20px 24px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 14 }}>Session Log</h3>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        {sessions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                No session history found. Start a new session on the Live Monitor.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
                                <thead>
                                    <tr>
                                        {['Date', 'Duration', 'Tremor', 'Stability', 'Max Tilt', 'Alerts', 'Drink Rate'].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '0 10px 8px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...sessions].reverse().map(s => (
                                        <tr key={s.id} style={{ background: 'rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '9px 10px', borderRadius: '8px 0 0 8px', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                                                {new Date(s.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td style={{ padding: '9px 10px', fontSize: '0.83rem' }}>{Math.floor(s.duration / 60)}m {s.duration % 60}s</td>
                                            <td style={{ padding: '9px 10px', fontWeight: 700, fontFamily: 'var(--font-display)', color: (s.avgTremorScore ?? s.peakTremorScore ?? 0) <= 20 ? '#2EC87C' : (s.avgTremorScore ?? s.peakTremorScore ?? 0) <= 50 ? '#A4E152' : (s.avgTremorScore ?? s.peakTremorScore ?? 0) <= 75 ? '#E09A30' : '#E05252' }}>
                                                {s.avgTremorScore ?? s.peakTremorScore ?? '—'}
                                            </td>
                                            <td style={{ padding: '9px 10px', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--success)' }}>{s.stabilityScore}%</td>
                                            <td style={{ padding: '9px 10px', fontSize: '0.83rem' }}>{s.maxTiltAngle}°</td>
                                            <td style={{ padding: '9px 10px', color: s.alertCount > 4 ? 'var(--danger)' : 'var(--text-secondary)', fontSize: '0.83rem' }}>{s.alertCount}</td>
                                            <td style={{ padding: '9px 10px', borderRadius: '0 8px 8px 0', fontWeight: 700, fontFamily: 'var(--font-display)', color: s.drinkSuccessRate >= 70 ? 'var(--success)' : s.drinkSuccessRate >= 40 ? 'var(--warning)' : 'var(--danger)' }}>
                                                {s.drinkSuccessRate}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </Layout>
    )
}
