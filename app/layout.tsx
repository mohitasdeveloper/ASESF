import type { Metadata } from 'next';
import { getAppSettingsServer } from '@/lib/settings.server';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAppSettingsServer();
  return {
    title: 'ASES — Academic Schedule Execution System',
    description: `Academic Schedule Management System for ${settings.college_name}`,
    icons: {
      icon: settings.logo_url,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
