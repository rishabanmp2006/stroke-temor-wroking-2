import React, { createContext, useContext, useState, useEffect } from 'react'
import {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    signInWithPopup,
    updateProfile,
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase/config'
import { createUserProfile, getUserProfile } from '../firebase/firestore'

const AuthContext = createContext(null)

export function useAuth() {
    return useContext(AuthContext)
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null)
    const [userProfile, setUserProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    async function register(email, password, displayName) {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName })
        await createUserProfile(cred.user.uid, { email, displayName, role: 'patient' })
        return cred
    }

    async function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password)
    }

    async function loginWithGoogle() {
        const cred = await signInWithPopup(auth, googleProvider)
        const existing = await getUserProfile(cred.user.uid)
        if (!existing) {
            await createUserProfile(cred.user.uid, {
                email: cred.user.email,
                displayName: cred.user.displayName,
                role: 'patient',
            })
        }
        return cred
    }

    function logout() {
        return signOut(auth)
    }

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user)
            if (user) {
                try {
                    const profile = await getUserProfile(user.uid)
                    setUserProfile(profile)
                } catch {
                    // Firebase not configured – use demo mode
                    setUserProfile({ role: 'patient', displayName: user.displayName || 'Demo User' })
                }
            } else {
                setUserProfile(null)
            }
            setLoading(false)
        })
        return unsub
    }, [])

    const value = {
        currentUser,
        userProfile,
        role: userProfile?.role || null,
        register,
        login,
        loginWithGoogle,
        logout,
        loading,
    }

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
