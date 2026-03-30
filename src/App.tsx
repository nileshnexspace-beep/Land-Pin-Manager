/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Eezily R1/R2/R3 Plots Mapping - Main Application Entry (v1.0.4)
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from './firebase';
import { APP_VERSION } from './version';
import AdminDashboard from './components/AdminDashboard';
import SharedPlotView from './components/SharedPlotView';
import { MapPin } from 'lucide-react';

function Login() {
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-neutral-200 text-center max-w-sm w-full">
        <MapPin className="mx-auto h-12 w-12 text-blue-600 mb-4" />
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">Eezily R1/R2/R3 Plots Mapping</h1>
        <p className="text-neutral-500 mb-6">Sign in to manage your plots and generate client links.</p>
        <button
          onClick={handleLogin}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Sign in with Google
        </button>
        <div className="mt-4 text-[10px] text-neutral-300">v{APP_VERSION}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={user ? <AdminDashboard /> : <Login />} />
        <Route path="/share/:id" element={<SharedPlotView />} />
      </Routes>
    </Router>
  );
}
