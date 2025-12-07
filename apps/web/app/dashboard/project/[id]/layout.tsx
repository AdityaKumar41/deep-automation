'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Rocket, Settings } from 'lucide-react';

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const projectId = params.id as string;

  // Redirect base project URL to chat
  useEffect(() => {
    if (pathname === `/dashboard/project/${projectId}`) {
      router.replace(`/dashboard/project/${projectId}/chat`);
    }
  }, [pathname, projectId, router]);

  // Determine active tab based on pathname
  const getActiveTab = () => {
    if (pathname.includes('/deployments')) return 'deployments';
    if (pathname.includes('/settings')) return 'settings';
    return 'chat';
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <Tabs value={getActiveTab()} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <Link href={`/dashboard/project/${projectId}/chat`}>
            <TabsTrigger value="chat" className="w-full">
              <MessageSquare className="w-4 h-4 mr-2" />
              AI Chat
            </TabsTrigger>
          </Link>
          <Link href={`/dashboard/project/${projectId}/deployments`}>
            <TabsTrigger value="deployments" className="w-full">
              <Rocket className="w-4 h-4 mr-2" />
              Deployments
            </TabsTrigger>
          </Link>
          <Link href={`/dashboard/project/${projectId}/settings`}>
            <TabsTrigger value="settings" className="w-full">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
          </Link>
        </TabsList>
      </Tabs>

      {/* Page Content */}
      {children}
    </div>
  );
}
