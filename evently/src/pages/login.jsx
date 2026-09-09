import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { API_BASE_URL, setSession } from '@/lib/api';

export default function Login() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to sign in');
      setSession(body.data);
      setLocation(body.data.user.role === 'organizer' ? '/dashboard' : '/events');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-muted/30 px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-background p-8 shadow-sm space-y-5">
        <div><h1 className="text-3xl font-black">Welcome back</h1><p className="text-muted-foreground">Sign in to Evently</p></div>
        {error && <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}
        <label className="block space-y-2"><span>Username or email</span><input className="w-full rounded-md border p-3" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label>
        <label className="block space-y-2"><span>Password</span><input className="w-full rounded-md border p-3" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <button className="w-full rounded-md bg-primary p-3 font-bold text-primary-foreground" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        <p className="text-center text-sm">New to Evently? <Link href="/register" className="text-primary">Create an account</Link></p>
      </form>
    </main>
  );
}

