import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameManagerService } from '../game-manager/game-manager.service';
import { RouterLink } from '@angular/router';

const BOOSTER_COST = 100000;
const TIME_BOOSTER_COST = 90000;
const ALIEN_CLEANER_COST = 25000;

@Component({
    selector: 'app-store',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './store.component.html',
    styleUrls: ['./store.component.scss'],
})
export class StoreComponent {
    boosterCost = BOOSTER_COST;
    timeBoosterCost = TIME_BOOSTER_COST;
    alienCleanerCost = ALIEN_CLEANER_COST;

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

    buyTimeBooster() {
        if (this.gameManager.spendCrushKeys(this.timeBoosterCost)) {
            this.gameManager.addTimeBooster(1);
            // Optionally, show a success message
            console.log('Time Booster purchased!');
        } else {
            // Optionally, show an error message
            console.log('Not enough Crush Keys!');
        }
    }

    buyAlienCleaner() {
        if (this.gameManager.spendCrushKeys(this.alienCleanerCost)) {
            this.gameManager.addAlienCleaner(1);
            // Optionally, show a success message
            console.log('Alien Cleaner purchased!');
        } else {
            // Optionally, show an error message
            console.log('Not enough Crush Keys!');
        }
    }
}
