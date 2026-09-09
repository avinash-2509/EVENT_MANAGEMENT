import { useEffect, useState } from 'react';
import { ListPlus } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/categories`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Unable to load categories');
        setCategories(body.data || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3"><ListPlus className="h-8 w-8 text-primary" /><div><h1 className="text-4xl font-black">Categories</h1><p className="text-muted-foreground">Event categories are maintained by the platform.</p></div></div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="divide-y rounded-2xl border bg-card">
        {categories.map((category) => <div key={category.id} className="flex items-center justify-between p-5"><span className="font-semibold">{category.name}</span><span className="text-sm text-muted-foreground">{category.slug}</span></div>)}
        {!error && categories.length === 0 && <p className="p-8 text-center text-muted-foreground">No categories have been seeded yet.</p>}
      </div>
    </div>
  );
}

