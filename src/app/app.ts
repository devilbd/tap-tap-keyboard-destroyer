import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GameManagerService } from '../game-manager/game-manager.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected title = '=> Tap tap keyboard destroyer <=';

  constructor(public gameManager: GameManagerService) {}
}
