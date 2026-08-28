import type { Metadata, Viewport } from 'next';
import './globals.css';

const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const siteUrl = process.env.SITE_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Scroll to Learn — Learn one swipe at a time',
  description: 'A swipeable feed of bite-sized lessons and quick quizzes.',
  openGraph: {
    title: 'Scroll to Learn',
    description: 'Learn one swipe at a time.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Scroll to Learn — Learn one swipe at a time.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scroll to Learn',
    description: 'Learn one swipe at a time.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#09080d',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
