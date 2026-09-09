import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { API_BASE_URL } from '@/lib/api';

export default function Register() {
  const [, setLocation] = useLocation();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to register');
      setLocation('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-muted/30 px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border bg-background p-8 shadow-sm space-y-5">
        <div><h1 className="text-3xl font-black">Create account</h1><p className="text-muted-foreground">New accounts are created as users.</p></div>
        {error && <p className="rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}
        <label className="block space-y-2"><span>Username</span><input className="w-full rounded-md border p-3" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} minLength={3} required /></label>
        <label className="block space-y-2"><span>Email</span><input className="w-full rounded-md border p-3" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label className="block space-y-2"><span>Password</span><input className="w-full rounded-md border p-3" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required /></label>
        <button className="w-full rounded-md bg-primary p-3 font-bold text-primary-foreground" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
        <p className="text-center text-sm">Already registered? <Link href="/login" className="text-primary">Sign in</Link></p>
      </form>
    </main>
  );
}

