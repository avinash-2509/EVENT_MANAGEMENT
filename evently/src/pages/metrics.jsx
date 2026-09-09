import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function MetricsPage() {
  const [data, setData] = useState({ logs: [], history: [] });
  const [error, setError] = useState('');
  useEffect(() => { apiFetch('/internal/metrics').then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setData(b); }).catch((e) => setError(e.message)); }, []);
  return <div className="container mx-auto px-4 py-12"><h1 className="text-4xl font-black">Internal metrics</h1>{error && <p className="text-destructive">{error}</p>}<div className="mt-8 overflow-x-auto rounded-xl border"><table className="w-full text-left"><thead><tr><th className="p-3">Method</th><th>Endpoint</th><th>Status</th><th>Duration</th></tr></thead><tbody>{data.logs.map((log) => <tr key={log.id} className="border-t"><td className="p-3">{log.method}</td><td>{log.endpoint}</td><td>{log.status}</td><td>{log.duration} ms</td></tr>)}</tbody></table></div></div>;
}

