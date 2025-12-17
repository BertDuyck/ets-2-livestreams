import { Component, effect, Signal, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  theme: Signal<'dark' | 'light'>;
  
  constructor() {
    if(window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.theme = signal('dark');
    } else {
      this.theme = signal('light');
    }

    effect(() => {
      if (this.theme() === 'dark') {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    })
  }

  toggleTheme(dark: boolean) {
    if (dark) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }
}
