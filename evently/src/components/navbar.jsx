import { useEffect, useState } from 'react';
import { Calendar, LayoutDashboard, LogOut, Menu, ScanLine, Ticket, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { getCurrentUser, logout, restoreSession } from '@/lib/api';

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(getCurrentUser());

  useEffect(() => { restoreSession().then(setUser); }, [location]);

  const signOut = async () => {
    await logout();
    setUser(null);
    setOpen(false);
    setLocation('/login');
  };

  const links = [
    { href: '/', label: 'Discover' },
    { href: '/events', label: 'Events' },
    ...(user?.role === 'user' ? [{ href: '/orders', label: 'My Orders', icon: Ticket }] : []),
    ...(user?.role === 'organizer' ? [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/check-in', label: 'Check In', icon: ScanLine },
      { href: '/metrics', label: 'Metrics' },
    ] : []),
    { href: '/categories', label: 'Categories' },
  ];

  return (
    <header className="fixed top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-black text-xl"><Calendar className="h-5 w-5" />Evently</Link>
        <nav className="hidden md:flex items-center gap-1">
          {links.map((link) => <Link key={link.href} href={link.href} className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">{link.label}</Link>)}
        </nav>
        <div className="hidden md:flex gap-2">
          {user?.role === 'organizer' && <Link href="/events/create"><Button>Create Event</Button></Link>}
          {!user && <Link href="/login"><Button variant="outline">Sign in</Button></Link>}
          {user && <Button variant="outline" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Logout</Button>}
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
      {open && <div className="border-t bg-background p-4 md:hidden space-y-2">
        {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="block rounded p-3">{link.label}</Link>)}
        {user?.role === 'organizer' && <Link href="/events/create" onClick={() => setOpen(false)} className="block rounded p-3">Create Event</Link>}
        {user ? <Button className="w-full" variant="outline" onClick={signOut}>Logout</Button> : <Link href="/login">Sign in</Link>}
      </div>}
    </header>
  );
}
