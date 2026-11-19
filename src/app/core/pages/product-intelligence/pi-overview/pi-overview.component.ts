import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PI_FEATURES } from '../../../constants/product-intelligence';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';

/** /psc/intelligence — entry point with the five Product Intelligence capabilities. */
@Component({
  selector: 'app-psc-pi-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, PscIllustrationComponent],
  templateUrl: './pi-overview.component.html',
  styleUrl: './pi-overview.component.scss'
})
export class PiOverviewComponent {
  readonly features = PI_FEATURES;
}
