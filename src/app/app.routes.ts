import { Routes } from '@angular/router';
import { PSC_ROUTES } from './psc.routes';

export const routes: Routes = [
  ...PSC_ROUTES,
  { path: '', redirectTo: '/psc/home', pathMatch: 'full' },
  { path: '**', redirectTo: '/psc/home' }
];
