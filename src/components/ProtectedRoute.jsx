import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, requiredRole }) {
    const { currentUser, role, loading } = useAuth()

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', minHeight: '100vh',
                background: 'var(--bg-primary)',
                flexDirection: 'column', gap: 16,
            }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                    Authenticating...
                </p>
            </div>
        )
    }

    if (!currentUser) return <Navigate to="/login" replace />

    if (requiredRole && role && role !== requiredRole) {
        return <Navigate to={role === 'therapist' ? '/therapist' : '/patient'} replace />
    }

    return children
}
