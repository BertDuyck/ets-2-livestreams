import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, Routes, withEnabledBlockingInitialNavigation } from '@angular/router';
import { LivestreamsContainerComponent } from './livestreams-container.component';

const routes: Routes = [
  { path: '', pathMatch: 'full', component: LivestreamsContainerComponent },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
  ]
};
