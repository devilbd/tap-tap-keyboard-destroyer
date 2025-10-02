import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameManagerService } from '../game-manager/game-manager.service';
import { RouterLink } from '@angular/router';

const BOOSTER_COST = 100000;

@Component({
  selector: 'app-store',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './store.component.html',
  styleUrls: ['./store.component.scss'],
})
export class StoreComponent {
  boosterCost = BOOSTER_COST;

  constructor(public gameManager: GameManagerService) {}

  buyBooster() {
    if (this.gameManager.spendCrushKeys(this.boosterCost)) {
      this.gameManager.addBooster(1);
      // Optionally, show a success message
      console.log('Booster purchased!');
    } else {
      // Optionally, show an error message
      console.log('Not enough Crush Keys!');
    }
  }
}
