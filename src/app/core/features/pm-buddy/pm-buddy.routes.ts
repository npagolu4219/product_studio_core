import { Routes } from '@angular/router';
import { PmBuddyShellComponent } from './pm-buddy-shell.component';

/** PM Buddy feature — mounted at /psc/pm-buddy (aliases: /psc/home/pm-buddy, /psc/dashboard/pm-buddy). */
export const PM_BUDDY_ROUTES: Routes = [
  {
    path: '',
    component: PmBuddyShellComponent,
    children: [
      { path: '', title: 'PM Buddy', loadComponent: () => import('./pages/buddy-home.component').then(m => m.BuddyHomeComponent) },
      { path: 'tasks', title: 'My Tasks · PM Buddy', loadComponent: () => import('./pages/buddy-tasks.component').then(m => m.BuddyTasksComponent) },
      { path: 'meetings', title: 'Meeting Memory · PM Buddy', loadComponent: () => import('./pages/buddy-meetings.component').then(m => m.BuddyMeetingsComponent) },
      { path: 'commitments', title: 'My Commitments · PM Buddy', loadComponent: () => import('./pages/buddy-commitments.component').then(m => m.BuddyCommitmentsComponent) },
      { path: 'ideas', title: 'Ideas & Notes · PM Buddy', loadComponent: () => import('./pages/buddy-ideas.component').then(m => m.BuddyIdeasComponent) },
      { path: 'briefing', title: 'Daily Briefing · PM Buddy', loadComponent: () => import('./pages/buddy-briefing.component').then(m => m.BuddyBriefingComponent) },
      { path: 'missing', title: 'What Am I Missing? · PM Buddy', loadComponent: () => import('./pages/buddy-missing.component').then(m => m.BuddyMissingComponent) },
      { path: '**', redirectTo: '' }
    ]
  }
];
