import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { ShellComponent } from './shell/shell.component';

/**
 * Matches Home (the prompt + chat page) and its conversation routes with a single route
 * config so Angular reuses the same HomeComponent instance between them:
 *   /psc/home                              → new chat (optionally ?project=<id> to scope it to a project)
 *   /psc/home/:artifact                    → new chat, artifact preselected (e.g. /prd)
 *   /psc/home/:artifact/:conversationId    → an existing conversation
 */
export function homeMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (!segments.length || segments[0].path !== 'home' || segments.length > 3) return null;
  // /psc/home/pm-buddy/... is a feature reached from Home, not an artifact chat.
  if (segments[1]?.path === 'pm-buddy') return null;
  const posParams: Record<string, UrlSegment> = {};
  if (segments[1]) posParams['artifact'] = segments[1];
  if (segments[2]) posParams['conversationId'] = segments[2];
  return { consumed: segments, posParams };
}

export const PSC_ROUTES: Routes = [
  {
    path: 'psc',
    component: ShellComponent,
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      },
      // PM Buddy (personal AI PM assistant). Aliases keep /psc/home/pm-buddy and the old /psc/dashboard/pm-buddy working.
      { path: 'home/pm-buddy', redirectTo: 'pm-buddy' },
      { path: 'dashboard/pm-buddy', redirectTo: 'pm-buddy' },
      {
        path: 'pm-buddy',
        loadChildren: () => import('./core/features/pm-buddy/pm-buddy.routes').then(m => m.PM_BUDDY_ROUTES)
      },
      {
        matcher: homeMatcher,
        loadComponent: () => import('./core/pages/home/home.component').then(m => m.HomeComponent)
      },
      // "Dashboard" was renamed to "Home" — old links and bookmarks (incl. chat URLs) keep working.
      { path: 'dashboard', redirectTo: 'home', pathMatch: 'full' },
      { path: 'dashboard/:artifact', redirectTo: 'home/:artifact' },
      { path: 'dashboard/:artifact/:conversationId', redirectTo: 'home/:artifact/:conversationId' },
      {
        path: 'projects',
        loadComponent: () => import('./core/pages/project-home/project-home.component').then(m => m.ProjectHomeComponent)
      },
      {
        path: 'teams',
        loadComponent: () => import('./core/pages/teams/teams.component').then(m => m.TeamsComponent)
      },
      {
        path: 'repository',
        loadComponent: () => import('./core/pages/repository/repository.component').then(m => m.RepositoryComponent)
      },
      {
        path: 'intelligence',
        loadComponent: () =>
          import('./core/pages/product-intelligence/product-intelligence.component').then(m => m.ProductIntelligenceComponent),
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./core/pages/product-intelligence/pi-overview/pi-overview.component').then(m => m.PiOverviewComponent)
          },
          {
            path: 'product-memory',
            loadComponent: () =>
              import('./core/pages/product-intelligence/product-memory/product-memory.component').then(m => m.ProductMemoryComponent)
          },
          {
            path: 'tool-sync',
            loadComponent: () => import('./core/pages/product-intelligence/tool-sync/tool-sync.component').then(m => m.ToolSyncComponent)
          },
          {
            path: 'dependencies',
            loadComponent: () =>
              import('./core/pages/product-intelligence/dependencies/dependencies.component').then(m => m.DependenciesComponent)
          },
          {
            path: 'customer-feedback',
            loadComponent: () =>
              import('./core/pages/product-intelligence/customer-feedback/customer-feedback.component').then(m => m.CustomerFeedbackComponent)
          },
          {
            path: 'ai-decision-context',
            loadComponent: () =>
              import('./core/pages/product-intelligence/ai-decision-context/ai-decision-context.component').then(m => m.AiDecisionContextComponent)
          },
          { path: '**', redirectTo: '' }
        ]
      },
      // Retired pages: Knowledge Hub → Product Memory, AI Workspace → Home.
      { path: 'knowledge', redirectTo: 'intelligence/product-memory' },
      { path: 'workspace', redirectTo: 'home' },
      {
        path: 'integrations',
        loadComponent: () => import('./core/pages/integrations/integrations.component').then(m => m.IntegrationsComponent)
      },
      {
        path: 'analytics',
        loadComponent: () => import('./core/pages/analytics/analytics.component').then(m => m.AnalyticsComponent)
      },
      {
        path: 'jobs',
        loadComponent: () => import('./core/pages/jobs/jobs.component').then(m => m.JobsComponent)
      },
      {
        path: '**',
        redirectTo: 'home'
      }
    ]
  }
];
