import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAnalytics, logEvent as fbLogEvent, isSupported } from 'firebase/analytics'

export const firebaseConfig = {
    apiKey: "AIzaSyBQ7c9JkZ3zWlyIjZLl1O1sJJOrKfYJbmA",
    authDomain: "hitzkopf-f0ea6.firebaseapp.com",
    projectId: "hitzkopf-f0ea6",
    storageBucket: "hitzkopf-f0ea6.firebasestorage.app",
    messagingSenderId: "828164655874",
    appId: "1:828164655874:web:1cab759bdb03bfb736101b",
    measurementId: "G-420ZXL57F8"
}

export const app = getApps().find(a => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig)

let analyticsInstance = null
isSupported().then(supported => {
    if (supported) analyticsInstance = getAnalytics(app)
}).catch(() => {})

export const logEvent = (eventName, params) => {
    if (analyticsInstance) fbLogEvent(analyticsInstance, eventName, params)
}
