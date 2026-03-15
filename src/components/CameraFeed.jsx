import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import useCameraAI from '../hooks/useCameraAI'

const CameraFeed = forwardRef(function CameraFeed({ onMetrics, active, tiltAlertLevel, aiReady, bodyDetected, activity }, ref) {
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const [cameraError, setCameraError] = useState(null)
    const [cameraReady, setCameraReady] = useState(false)
    const streamRef = useRef(null)

    const { calibrateTilt, aiReady: hookAiReady, loadingMessage } = useCameraAI({ videoRef, canvasRef, onMetrics, active })

    // Use hook-level aiReady if parent doesn't supply it
    const isAiReady = aiReady !== undefined ? aiReady : hookAiReady

    useImperativeHandle(ref, () => ({
        calibrate: calibrateTilt
    }))

    useEffect(() => {
        let mounted = true
        async function startCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                    audio: false,
                })
                if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
                streamRef.current = stream
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play()
                        setCameraReady(true)
                    }
                }
            } catch (err) {
                setCameraError(err.message || 'Camera access denied')
            }
        }
        startCamera()
        return () => {
            mounted = false
            streamRef.current?.getTracks().forEach(t => t.stop())
        }
    }, [])

    const getBorderStyle = () => {
        if (tiltAlertLevel === 'critical') return '2px solid var(--danger)'
        if (tiltAlertLevel === 'warning') return '2px solid var(--warning)'
        return '2px solid var(--border-gold)'
    }

    // Activity glow color
    const getActivityGlow = () => {
        if (!active) return 'none'
        if (activity === 'Drinking') return '0 0 30px rgba(46,200,124,0.35), inset 0 0 20px rgba(46,200,124,0.08)'
        if (activity === 'Standing') return '0 0 25px rgba(200,169,81,0.3), inset 0 0 15px rgba(200,169,81,0.06)'
        if (activity === 'Sitting') return '0 0 25px rgba(14,94,79,0.35), inset 0 0 15px rgba(14,94,79,0.08)'
        return 'var(--shadow-gold)'
    }

    return (
        <div style={{
            position: 'relative',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            background: '#000',
            border: getBorderStyle(),
            boxShadow: tiltAlertLevel === 'critical'
                ? '0 0 30px rgba(224,82,82,0.3)'
                : tiltAlertLevel === 'warning'
                    ? '0 0 20px rgba(224,154,48,0.2)'
                    : getActivityGlow(),
            transition: 'border-color 0.3s, box-shadow 0.6s ease',
            aspectRatio: '16/9',
            width: '100%',
        }}>
            {/* Live badge */}
            <div style={{
                position: 'absolute', top: 12, left: 12, zIndex: 10,
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
                padding: '5px 12px', borderRadius: 20,
                border: '1px solid var(--border-gold)',
                fontSize: '0.75rem', fontFamily: 'var(--font-display)',
                fontWeight: 600, color: 'var(--text-primary)',
            }}>
                <span className="live-dot"></span>
                {active ? 'LIVE ANALYSIS' : 'CAMERA READY'}
            </div>

            {/* AI Status Indicator Badge (top-right) */}
            {active && (
                <div style={{
                    position: 'absolute', top: 12, right: 12, zIndex: 10,
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(8px)',
                    padding: '5px 14px', borderRadius: 20,
                    border: `1px solid ${isAiReady ? 'rgba(46,200,124,0.5)' : 'rgba(200,169,81,0.5)'}`,
                    fontSize: '0.72rem', fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    color: isAiReady ? '#2EC87C' : '#C8A951',
                    transition: 'all 0.4s ease',
                }}>
                    <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: isAiReady ? '#2EC87C' : '#C8A951',
                        display: 'inline-block',
                        animation: isAiReady ? 'none' : 'pulse-gold 1.2s ease-in-out infinite',
                    }} />
                    {isAiReady ? 'AI Active' : 'AI Initializing...'}
                </div>
            )}

            {/* Tilt warning overlay – below AI badge */}
            {tiltAlertLevel !== 'none' && (
                <div style={{
                    position: 'absolute', top: active ? 48 : 12, right: 12, zIndex: 10,
                    background: tiltAlertLevel === 'critical' ? 'rgba(224,82,82,0.9)' : 'rgba(224,154,48,0.9)',
                    padding: '5px 14px', borderRadius: 20,
                    fontSize: '0.75rem', fontFamily: 'var(--font-display)',
                    fontWeight: 700, color: '#fff',
                    animation: tiltAlertLevel === 'critical' ? 'pulse-gold 0.8s infinite' : 'none',
                }}>
                    ⚠ TILT {tiltAlertLevel === 'critical' ? 'CRITICAL' : 'WARNING'}
                </div>
            )}

            {/* Body not detected fallback */}
            {active && bodyDetected === false && isAiReady && (
                <div style={{
                    position: 'absolute', bottom: 16, left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 15,
                    background: 'rgba(224,154,48,0.9)',
                    backdropFilter: 'blur(8px)',
                    padding: '8px 20px', borderRadius: 24,
                    fontSize: '0.82rem', fontFamily: 'var(--font-display)',
                    fontWeight: 600, color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 8,
                    animation: 'fadeInUp 0.4s ease',
                }}>
                    <span style={{ fontSize: '1.1rem' }}>🧍</span>
                    Body not detected. Step back.
                </div>
            )}

            {cameraError ? (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', minHeight: 320,
                    color: 'var(--text-secondary)', gap: 12, padding: 24,
                }}>
                    <div style={{ fontSize: '3rem' }}>📷</div>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Camera Unavailable</p>
                    <p style={{ fontSize: '0.85rem', textAlign: 'center', color: 'var(--text-muted)' }}>{cameraError}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--gold)', textAlign: 'center' }}>
                        Grant camera permission and reload the page
                    </p>
                </div>
            ) : (
                <>
                    {/* AI Loading Screen */}
                    {active && !isAiReady && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.85)',
                            backdropFilter: 'blur(12px)',
                            zIndex: 20, gap: 12,
                        }}>
                            <div className="spinner" style={{ width: 48, height: 48 }}></div>
                            <p style={{
                                color: 'var(--gold)', fontSize: '0.95rem',
                                fontFamily: 'var(--font-display)', fontWeight: 600,
                                textAlign: 'center', maxWidth: 320, padding: '0 16px',
                            }}>
                                {loadingMessage || 'Loading AI Models...'}
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', maxWidth: 300, padding: '0 16px' }}>
                                {loadingMessage?.includes('CDN')
                                    ? '⚠️ First load takes 1–3 min. Run the curl commands in mediapipeInit.js to cache models locally.'
                                    : 'Initializing hand & pose detection'}
                            </p>
                        </div>
                    )}

                    {!cameraReady && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            background: '#000', zIndex: 5,
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div className="spinner" style={{ marginBottom: 16 }}></div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Initializing camera...</p>
                            </div>
                        </div>
                    )}
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover', display: 'block',
                            transform: 'scaleX(-1)', // mirror
                        }}
                    />
                    <canvas
                        ref={canvasRef}
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%',
                            transform: 'scaleX(-1)', // mirror to match video
                            pointerEvents: 'none',
                        }}
                    />
                </>
            )}
        </div>
    )
})

export default CameraFeed
