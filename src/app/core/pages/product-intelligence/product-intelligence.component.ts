import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PI_FEATURES } from '../../constants/product-intelligence';

/** Layout for /psc/intelligence: section tab strip + the active feature page. */
@Component({
  selector: 'app-psc-product-intelligence',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './product-intelligence.component.html',
  styleUrl: './product-intelligence.component.scss'
})
export class ProductIntelligenceComponent {
  readonly features = PI_FEATURES;
}
