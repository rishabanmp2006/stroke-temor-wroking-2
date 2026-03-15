import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import PatientDashboard from './pages/PatientDashboard'
import PatientHistory from './pages/PatientHistory'

/**
 * FIX Bug 6 (therapist redirect loop):
 * ProtectedRoute was redirecting role=therapist to /therapist which didn't exist,
 * causing an infinite redirect. Added a proper fallback route and a placeholder
 * TherapistPage so the redirect has somewhere to land.
 *
 * To build the therapist portal later: replace TherapistPlaceholder with the real page.
 */
function TherapistPlaceholder() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '100vh',
            background: 'var(--bg-primary)', gap: 16,
        }}>
            <div style={{ fontSize: '3rem' }}>🩺</div>
            <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                Therapist Portal
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Coming soon — therapist dashboard is under construction.
            </p>
            <a href="/login" style={{ color: 'var(--gold)', fontSize: '0.85rem' }}>
                Back to login
            </a>
        </div>
    )
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    {/* Public */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* Patient routes */}
                    <Route path="/patient" element={
                        <ProtectedRoute requiredRole="patient"><PatientDashboard /></ProtectedRoute>
                    } />
                    <Route path="/patient/history" element={
                        <ProtectedRoute requiredRole="patient"><PatientHistory /></ProtectedRoute>
                    } />

                    {/* Therapist routes — placeholder prevents infinite redirect */}
                    <Route path="/therapist" element={
                        <ProtectedRoute requiredRole="therapist"><TherapistPlaceholder /></ProtectedRoute>
                    } />

                    {/* Default */}
                    <Route path="/" element={<Navigate to="/login" replace />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    )
}
