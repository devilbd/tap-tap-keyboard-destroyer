import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CosmicParticlesComponent } from '../cosmic-particles/cosmic-particles.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CosmicParticlesComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = 'tap-tap-keyboard-destroyer';
}
