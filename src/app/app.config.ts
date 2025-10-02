import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import {
  getAnalytics,
  provideAnalytics,
  ScreenTrackingService,
  UserTrackingService,
} from '@angular/fire/analytics';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

// TODO: Replace with your actual Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyCqA6PmV5hdYC0x-BCfd2cDV4RhrMUktWE',
  authDomain: 'tap-tap-keyboard-destroyer.firebaseapp.com',
  projectId: 'tap-tap-keyboard-destroyer',
  storageBucket: 'tap-tap-keyboard-destroyer.firebasestorage.app',
  messagingSenderId: '906251850605',
  appId: '1:906251850605:web:d88a546cdc044ac65cc064',
  measurementId: 'G-GC7EJD942L',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAnalytics(() => getAnalytics()),
    ScreenTrackingService,
    UserTrackingService,
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
