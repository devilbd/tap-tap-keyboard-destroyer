import { Routes } from '@angular/router';
import { CosmicParticlesComponent } from '../cosmic-particles/cosmic-particles.component';
import { StoreComponent } from '../store/store.component';

export const routes: Routes = [
  { path: '', redirectTo: 'game', pathMatch: 'full' },
  { path: 'game', component: CosmicParticlesComponent },
  { path: 'store', component: StoreComponent },
];
