import React, { useState, useCallback, useRef } from 'react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts'
import Layout from '../components/Layout'
import CameraFeed from '../components/CameraFeed'
import useSession from '../hooks/useSession'
import { useAuth } from '../contexts/AuthContext'

const SEVERITY_COLORS = {
    Stable: '#2EC87C', Mild: '#A4E152', Moderate: '#E09A30', Severe: '#E05252',
}

const ACTIVITY_ICONS = {
    Idle: '😴', Drinking: '🥤', Standing: '🧍', Sitting: '🪑',
}

const ACTIVITY_COLORS = {
    Idle: 'var(--text-muted)',
    Drinking: '#2EC87C',
    Standing: '#C8A951',
    Sitting: '#12785F',
}

const IS_DEV = import.meta.env.DEV

function MetricCard({ label, value, unit, sub, colorClass, icon, progress, glowColor }) {
    return (
        <div className="glass-card" style={{
            padding: '18px 20px',
            boxShadow: glowColor ? `0 0 20px ${glowColor}25, inset 0 0 10px ${glowColor}08` : undefined,
            transition: 'box-shadow 0.6s ease',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ fontSize: '1.2rem' }}>{icon}</span>
            </div>
            <div className={`metric-value ${colorClass || ''}`} style={{ marginBottom: 4 }}>{value}</div>
            {unit && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{unit}</div>}
            {progress !== undefined && (
                <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: `${progress}%`,
                        background: 'currentColor', borderRadius: 4, transition: 'width 0.4s ease'
                    }} className={colorClass || ''} />
                </div>
            )}
            {sub && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 8 }}>{sub}</div>}
        </div>
    )
}

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
        return (
            <div style={{ background: 'rgba(15,15,15,0.95)', border: '1px solid var(--border-gold)', borderRadius: 8, padding: '8px 14px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>{label}s</p>
                <p style={{ color: 'var(--gold)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                    {payload[0].value} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>tremor</span>
                </p>
            </div>
        )
    }
    return null
}

export default function PatientDashboard() {
    const { userProfile, currentUser } = useAuth()
    const [metrics, setMetrics] = useState({
        tremorScore: 0, stabilityScore: 100,
        severity: { label: 'Stable', className: 'severity-stable' },
        oscillationFreq: '0.0', tilt: { angle: 0, baseline: 0, alertLevel: 'none' },
        activity: 'Idle', drinkSuccessCount: 0, isUnstableDrink: false,
        confidence: 0, bodyDetected: true, aiReady: false,
        postureDurationMs: 0, fallRisk: 'low',
    })
    const [liveTremorData, setLiveTremorData] = useState([])
    const [sessionActive, setSessionActive] = useState(false)
    const [drinkEvents, setDrinkEvents] = useState([])
    const [sessionSummaryData, setSessionSummaryData] = useState(null)
    const [showDebug, setShowDebug] = useState(IS_DEV)
    const tickRef = useRef(0)
    const cameraRef = useRef(null)
    const prevDrinkCountRef = useRef(0)
    // FIX Bug 4: accumulate unstable drink count across the session
    const drinkUnstableCountRef = useRef(0)
    const [drinkUnstableDisplay, setDrinkUnstableDisplay] = useState(0)
    const wasUnstableRef = useRef(false)
    const session = useSession()

    const handleMetrics = useCallback((m) => {
        setMetrics(m)
        session.recordMetrics(m)

        // Graph point every ~1s (30 fps → every 30 frames)
        tickRef.current++
        if (tickRef.current % 30 === 0) {
            const ts = tickRef.current / 30
            setLiveTremorData(prev => {
                const next = [...prev, { t: Math.round(ts), score: m.tremorScore }]
                return next.slice(-60)
            })
        }

        // Track successful drink events
        if (m.drinkSuccessCount > prevDrinkCountRef.current) {
            const drinkEv = {
                type: 'successful',
                avgTremorScore: m.tremorScore,
                avgAngle: m.tilt?.angle || 0,
                timestamp: Date.now(),
            }
            setDrinkEvents(prev => [drinkEv, ...prev].slice(0, 10))
            prevDrinkCountRef.current = m.drinkSuccessCount
        }

        // FIX Bug 4: detect rising edge of unstable drinking (new bout, not every frame)
        if (m.isUnstableDrink && !wasUnstableRef.current) {
            drinkUnstableCountRef.current++
            setDrinkUnstableDisplay(drinkUnstableCountRef.current)
        }
        wasUnstableRef.current = !!m.isUnstableDrink

    }, [session])

    const handleStartSession = () => {
        session.startSession()
        setSessionActive(true)
        setLiveTremorData([])
        setDrinkEvents([])
        tickRef.current = 0
        prevDrinkCountRef.current = 0
        drinkUnstableCountRef.current = 0
        setDrinkUnstableDisplay(0)
        wasUnstableRef.current = false
        setSessionSummaryData(null)
    }

    const handleEndSession = async () => {
        const summary = await session.endSession()
        setSessionActive(false)
        setSessionSummaryData(summary)
    }

    const displayName = currentUser?.displayName || userProfile?.displayName || 'Patient'
    const activityColor = ACTIVITY_COLORS[metrics.activity] || 'var(--text-muted)'
    const activityIcon = ACTIVITY_ICONS[metrics.activity] || '😴'

    // FIX: only show live metrics when body is actually detected
    const showLiveMetrics = metrics.bodyDetected !== false

    return (
        <Layout>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                        Live <span className="text-gold">Motor Analysis</span>
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Real-time AI-powered hand & pose monitoring · {displayName}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {IS_DEV && sessionActive && (
                        <button
                            className="btn-outline"
                            onClick={() => setShowDebug(d => !d)}
                            style={{ padding: '6px 12px', fontSize: '0.72rem' }}
                        >
                            {showDebug ? '🐛 Hide Debug' : '🐛 Debug'}
                        </button>
                    )}
                    {!sessionActive ? (
                        <button className="btn-gold" onClick={handleStartSession} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>▶</span> Start Session
                        </button>
                    ) : (
                        <button className="btn-danger" onClick={handleEndSession} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>◼</span> End Session
                        </button>
                    )}
                </div>
            </div>

            {/* Main grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 20 }}>
                {/* Camera Area */}
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <CameraFeed
                        ref={cameraRef}
                        onMetrics={handleMetrics}
                        active={sessionActive}
                        tiltAlertLevel={metrics.tilt?.alertLevel || 'none'}
                        aiReady={metrics.aiReady}
                        bodyDetected={metrics.bodyDetected}
                        activity={metrics.activity}
                    />

                    {showDebug && metrics.debug && sessionActive && (
                        <div style={{
                            position: 'absolute', top: 16, left: 16, zIndex: 50,
                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                            padding: '12px 16px', borderRadius: '8px',
                            border: '1px solid var(--border-gold)',
                            pointerEvents: 'none',
                            fontFamily: 'monospace', fontSize: '0.78rem',
                            color: 'lime', lineHeight: 1.5,
                            minWidth: '220px',
                        }}>
                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                                [DEBUG AI ENGINE]
                            </div>
                            <div>Wrist→Nose  : {metrics.debug.wristToNose?.toFixed(3)} {metrics.debug.wristAtMouthLevel ? '✅mouth' : '🔻low'}</div>
                            <div>L/R Elbow   : {metrics.debug.lElbowAngle?.toFixed(0)}° / {metrics.debug.rElbowAngle?.toFixed(0)}°</div>
                            <div>L/R Knee    : {metrics.debug.leftKneeAngle?.toFixed(0)}° / {metrics.debug.rightKneeAngle?.toFixed(0)}°</div>
                            <div>Grip        : {metrics.debug.gripDetected ? '✅' : '❌'} | DrinkCond: {metrics.debug.drinkCondition ? '✅' : '❌'}</div>
                            <div>HipsAboveKnees : {metrics.debug.hipsAboveKnees ? '✅' : '❌'} | AtKneeLevel: {metrics.debug.hipsAtKneeLevel ? '✅' : '❌'}</div>
                            <div>KneesStraight  : {metrics.debug.kneesAreStraight ? '✅' : '❌'} | SitCond: {metrics.debug.sittingCondition ? '✅' : '❌'}</div>
                            <div>Sit Counter : {metrics.debug.sittingCounter}/20 | StandCnt: {metrics.debug.standingCounter}</div>
                            <div>Tilt Alert  : {metrics.tilt?.alertLevel}</div>
                            <div style={{ marginTop: '6px', color: activityColor, fontWeight: 'bold' }}>
                                State: {metrics.activity} ({metrics.confidence}%)
                            </div>
                        </div>
                    )}
                </div>

                {/* Metrics panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Tremor severity big card */}
                    <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Tremor Severity</div>
                        <div style={{
                            fontSize: '4rem', fontFamily: 'var(--font-display)', fontWeight: 900,
                            lineHeight: 1,
                            // FIX: grey out when body not detected instead of showing stale data
                            color: showLiveMetrics
                                ? (SEVERITY_COLORS[metrics.severity.label] || '#fff')
                                : 'var(--text-muted)',
                            marginBottom: 6,
                        }}>
                            {showLiveMetrics ? metrics.tremorScore : '—'}
                        </div>
                        <div style={{
                            display: 'inline-block', padding: '4px 16px', borderRadius: 20,
                            background: showLiveMetrics ? `${SEVERITY_COLORS[metrics.severity.label]}22` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${showLiveMetrics ? `${SEVERITY_COLORS[metrics.severity.label]}44` : 'var(--glass-border)'}`,
                            color: showLiveMetrics ? SEVERITY_COLORS[metrics.severity.label] : 'var(--text-muted)',
                            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem',
                        }}>
                            {showLiveMetrics ? metrics.severity.label : 'No body detected'}
                        </div>
                        <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${showLiveMetrics ? metrics.tremorScore : 0}%`,
                                background: showLiveMetrics
                                    ? `linear-gradient(90deg, var(--success), ${SEVERITY_COLORS[metrics.severity.label]})`
                                    : 'rgba(255,255,255,0.1)',
                                borderRadius: 4, transition: 'width 0.4s ease',
                            }} />
                        </div>
                    </div>

                    <MetricCard label="Stability Score" value={showLiveMetrics ? metrics.stabilityScore : '—'} unit="/ 100" icon="🎯"
                        colorClass={metrics.stabilityScore > 70 ? 'severity-stable' : metrics.stabilityScore > 40 ? 'severity-mild' : 'severity-severe'}
                        progress={showLiveMetrics ? metrics.stabilityScore : 0}
                    />

                    {/* Tilt Gauge */}
                    <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Wrist Tilt Gauge</span>
                            <button onClick={() => cameraRef.current?.calibrate()} className="btn-gold" style={{ padding: '4px 10px', fontSize: '0.7rem', borderRadius: 4 }}>
                                Calibrate
                            </button>
                        </div>
                        <div style={{ position: 'relative', width: 120, height: 120 }}>
                            <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" strokeDasharray={`${(metrics.tilt.baseline / 360) * 251.2} 251.2`} />
                                <circle cx="50" cy="50" r="40" fill="none"
                                    stroke={
                                        metrics.tilt.alertLevel === 'critical' ? 'var(--danger)'
                                        : metrics.tilt.alertLevel === 'warning' ? 'var(--warning)'
                                        : 'var(--success)'
                                    }
                                    strokeWidth="8"
                                    strokeDasharray={`${(Math.min(180, metrics.tilt.angle) / 180) * 125.6} 251.2`}
                                    style={{ transition: 'stroke-dasharray 0.3s ease, stroke 0.3s ease' }}
                                />
                            </svg>
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{metrics.tilt.angle}°</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>{metrics.tilt.baseline}° Base</div>
                            </div>
                        </div>
                    </div>

                    <MetricCard label="Oscillation Freq" value={`${metrics.oscillationFreq} Hz`} sub="3s rolling window" icon="〰️" />

                    {/* Activity Card */}
                    <div className="glass-card" style={{
                        padding: '18px 20px',
                        boxShadow: metrics.activity !== 'Idle'
                            ? `0 0 20px ${activityColor}25, inset 0 0 10px ${activityColor}08`
                            : undefined,
                        transition: 'box-shadow 0.6s ease, border-color 0.4s ease',
                        borderColor: metrics.activity !== 'Idle' ? `${activityColor}44` : undefined,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Activity</span>
                            <span style={{ fontSize: '1.2rem' }}>{activityIcon}</span>
                        </div>
                        <div style={{
                            fontFamily: 'var(--font-display)', fontWeight: 800,
                            fontSize: '2.4rem', lineHeight: 1, letterSpacing: '-0.02em',
                            color: activityColor,
                            transition: 'color 0.4s ease',
                        }}>
                            {metrics.activity}
                        </div>
                        {metrics.activity !== 'Idle' && (
                            <div style={{ marginTop: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Confidence</span>
                                    <span style={{ fontSize: '0.72rem', color: activityColor, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                                        {metrics.confidence}%
                                    </span>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', width: `${metrics.confidence}%`,
                                        background: activityColor,
                                        borderRadius: 4, transition: 'width 0.4s ease',
                                    }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Posture Duration Timer */}
                    {metrics.activity !== 'Idle' && metrics.activity !== 'Drinking' && (
                        <div className="glass-card" style={{ padding: '16px 20px' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                                Posture Duration
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', color: activityColor }}>
                                {Math.floor((metrics.postureDurationMs || 0) / 60000)}m {Math.floor(((metrics.postureDurationMs || 0) % 60000) / 1000)}s
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                Continuously {metrics.activity.toLowerCase()}
                            </div>
                        </div>
                    )}

                    {/* Fall Risk — only shown when standing */}
                    {metrics.activity === 'Standing' && (
                        <div className="glass-card" style={{
                            padding: '14px 20px',
                            borderColor: metrics.fallRisk === 'high' ? 'rgba(224,82,82,0.5)'
                                : metrics.fallRisk === 'moderate' ? 'rgba(224,154,48,0.4)' : undefined,
                            boxShadow: metrics.fallRisk === 'high' ? '0 0 16px rgba(224,82,82,0.2)' : undefined,
                        }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Fall Risk</div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem',
                                color: metrics.fallRisk === 'high' ? 'var(--danger)'
                                    : metrics.fallRisk === 'moderate' ? 'var(--warning)' : 'var(--success)',
                                textTransform: 'capitalize',
                            }}>
                                {metrics.fallRisk === 'high' ? '🔴' : metrics.fallRisk === 'moderate' ? '🟡' : '🟢'} {metrics.fallRisk}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Based on tremor severity while standing</div>
                        </div>
                    )}

                    {/* Drinking stats — FIX Bug 4: drinkUnstableDisplay now actually increments */}
                    <div className="glass-card" style={{
                        padding: '16px 20px',
                        boxShadow: metrics.activity === 'Drinking'
                            ? '0 0 20px rgba(46,200,124,0.2), inset 0 0 10px rgba(46,200,124,0.05)'
                            : undefined,
                        transition: 'box-shadow 0.6s ease',
                    }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Drinking Events</div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: 'rgba(46,200,124,0.08)', borderRadius: 8, border: '1px solid rgba(46,200,124,0.2)' }}>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--success)' }}>{metrics.drinkSuccessCount}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>Successful</div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: 'rgba(224,82,82,0.08)', borderRadius: 8, border: '1px solid rgba(224,82,82,0.2)' }}>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--danger)' }}>{drinkUnstableDisplay}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>Unstable</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Live tremor graph */}
            <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                        <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 2 }}>Live Tremor Timeline</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Updated every second · rolling 60s window</p>
                    </div>
                    {sessionActive && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--success)' }}><span className="live-dot" />Recording</span>}
                </div>
                <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={liveTremorData}>
                        <defs>
                            <linearGradient id="tremorGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#C8A951" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#C8A951" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="t" stroke="#5C5548" tick={{ fontSize: 11 }} tickFormatter={v => `${v}s`} />
                        <YAxis stroke="#5C5548" tick={{ fontSize: 11 }} domain={[0, 100]} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={20} stroke="rgba(46,200,124,0.3)" strokeDasharray="4 4" label={{ value: 'Stable', fill: '#2EC87C', fontSize: 10 }} />
                        <ReferenceLine y={50} stroke="rgba(224,154,48,0.3)" strokeDasharray="4 4" label={{ value: 'Mild', fill: '#E09A30', fontSize: 10 }} />
                        <ReferenceLine y={75} stroke="rgba(224,82,82,0.3)" strokeDasharray="4 4" label={{ value: 'Moderate', fill: '#E05252', fontSize: 10 }} />
                        <Area type="monotone" dataKey="score" stroke="#C8A951" strokeWidth={2} fill="url(#tremorGrad)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Recent drink events + session summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Drink Events Log */}
                <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 14 }}>Recent Drink Events</h3>
                    {drinkEvents.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                            No drinking events detected yet.<br />Bring a cup near your mouth during the session.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {drinkEvents.map((ev, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 12px', borderRadius: 8,
                                    background: ev.type === 'successful' ? 'rgba(46,200,124,0.06)' : 'rgba(224,82,82,0.06)',
                                    border: `1px solid ${ev.type === 'successful' ? 'rgba(46,200,124,0.2)' : 'rgba(224,82,82,0.2)'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>{ev.type === 'successful' ? '✅' : '⚠️'}</span>
                                        <div>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: ev.type === 'successful' ? 'var(--success)' : 'var(--danger)', textTransform: 'capitalize' }}>
                                                {ev.type}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tremor: {ev.avgTremorScore} · Tilt: {ev.avgAngle}°</div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        {new Date(ev.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Session Summary */}
                <div className="glass-card" style={{ padding: '20px 24px' }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 14 }}>Session Summary</h3>
                    {!sessionSummaryData ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                            {sessionActive ? 'Session in progress...' : 'Start a session to see your summary here.'}
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Duration', value: `${Math.floor(sessionSummaryData.duration / 60)}m ${sessionSummaryData.duration % 60}s`, icon: '⏱' },
                                // FIX Bug 3: now shows avgTremorScore (which is correctly saved)
                                { label: 'Avg Tremor Score', value: sessionSummaryData.avgTremorScore ?? '—', icon: '📊' },
                                { label: 'Peak Tremor', value: sessionSummaryData.peakTremorScore ?? '—', icon: '📈' },
                                { label: 'Stability Score', value: `${sessionSummaryData.stabilityScore}/100`, icon: '🎯' },
                                { label: 'Max Tilt Angle', value: `${sessionSummaryData.maxTiltAngle}°`, icon: '📐' },
                                { label: 'Tilt Alerts', value: sessionSummaryData.alertCount, icon: '⚠️' },
                                { label: 'Successful Drinks', value: sessionSummaryData.drinkSuccessCount || 0, icon: '🥤' },
                                // FIX Bug 4: drinkUnstableCount now populated
                                { label: 'Unstable Drinks', value: sessionSummaryData.drinkUnstableCount || 0, icon: '⚡' },
                                { label: 'Drink Success Rate', value: `${sessionSummaryData.drinkSuccessRate}%`, icon: '✅' },
                            ].map(({ label, value, icon }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--glass-border)' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: '0.9rem' }}>{icon}</span> {label}
                                    </span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{value}</span>
                                </div>
                            ))}
                            <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(200,169,81,0.06)', border: '1px solid var(--border-gold)', fontSize: '0.8rem', color: 'var(--gold)' }}>
                                ✓ Session saved · Data synced to your therapist
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    )
}
