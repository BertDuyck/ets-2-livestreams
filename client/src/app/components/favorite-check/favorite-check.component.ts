import { NgIf } from "@angular/common";
import { Component, input, model } from "@angular/core";

@Component({
    selector: 'app-favorite-check',
    templateUrl: './favorite-check.component.html',
    styleUrl: './favorite-check.component.scss',
    imports: [NgIf]
})
export class FavoriteCheckComponent {
    checked = model.required<boolean>();
    size = input<string>('6');
}