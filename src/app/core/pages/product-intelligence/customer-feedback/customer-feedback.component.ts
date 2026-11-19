import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { d } from '../../../utils/date-utils';

interface ConnectedSource {
  id: string;
  type: 'intercom' | 'zendesk' | 'g2' | 'slack' | 'survey' | 'email' | 'custom';
  name: string;
  url: string;
  apiKey: string;
  status: 'active' | 'error';
  itemCount: number;
}

interface AddSourceForm {
  type: ConnectedSource['type'] | '';
  name: string;
  url: string;
  apiKey: string;
}

interface FeedbackItem {
  id: string;
  source: 'intercom' | 'zendesk' | 'g2' | 'slack' | 'survey' | 'email';
  customer: string;
  customerInitials: string;
  company: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  category: string;
  summary: string;
  verbatim: string;
  project: string;
  projectColor: string;
  date: string;
  linkedFeature?: string;
  priority: 'high' | 'medium' | 'low';
  votes: number;
}

interface FeedbackInsight {
  id: string;
  theme: string;
  count: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  trend: number;
  topRequest: string;
  linkedFeatures: string[];
  color: string;
}

@Component({
  selector: 'app-psc-customer-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './customer-feedback.component.html',
  styleUrl: './customer-feedback.component.scss',
})
export class CustomerFeedbackComponent implements OnInit {
  activeTab: 'insights' | 'feedback' | 'mapping' = 'insights';
  filterSentiment = '';
  filterCategory = '';
  search = '';

  showAddSourceModal = false;
  savingSource = false;
  sourceForm: AddSourceForm = { type: '', name: '', url: '', apiKey: '' };

  sources: ConnectedSource[] = [
    { id: 'src1', type: 'intercom', name: 'Intercom', url: 'https://app.intercom.com', apiKey: '', status: 'active', itemCount: 2 },
    { id: 'src2', type: 'g2', name: 'G2 Reviews', url: 'https://www.g2.com', apiKey: '', status: 'active', itemCount: 1 },
    { id: 'src3', type: 'zendesk', name: 'Zendesk', url: 'https://yourorg.zendesk.com', apiKey: '', status: 'active', itemCount: 1 },
    { id: 'src4', type: 'slack', name: 'Slack', url: 'https://hooks.slack.com', apiKey: '', status: 'active', itemCount: 1 },
    { id: 'src5', type: 'survey', name: 'Survey', url: '', apiKey: '', status: 'active', itemCount: 1 },
  ];

  readonly addSourceTypes: { value: ConnectedSource['type']; label: string }[] = [
    { value: 'intercom', label: 'Intercom' },
    { value: 'zendesk', label: 'Zendesk' },
    { value: 'g2', label: 'G2 Reviews' },
    { value: 'slack', label: 'Slack' },
    { value: 'survey', label: 'Survey' },
    { value: 'email', label: 'Email' },
    { value: 'custom', label: 'Custom' },
  ];

  readonly insights: FeedbackInsight[] = [
    { id: 'i1', theme: 'Checkout Friction', count: 47, sentiment: 'negative', trend: 12, topRequest: 'Reduce checkout steps to 3 or fewer', linkedFeatures: ['One-Click Guest Checkout', 'Smart Payment Selector'], color: '#DC2626' },
    { id: 'i2', theme: 'Mobile Performance', count: 34, sentiment: 'negative', trend: 8, topRequest: 'App is slow on older Android devices', linkedFeatures: ['Mobile App Redesign', 'Performance Optimization Epic'], color: '#D97706' },
    { id: 'i3', theme: 'Payment Options', count: 28, sentiment: 'neutral', trend: 5, topRequest: 'Add BNPL options like Klarna and Afterpay', linkedFeatures: ['Payment Integration Epic'], color: '#2563EB' },
    { id: 'i4', theme: 'Search & Discovery', count: 22, sentiment: 'negative', trend: -3, topRequest: 'Search results are not relevant enough', linkedFeatures: ['AI-Powered Search Epic', 'Natural Language Search'], color: '#7C3AED' },
    { id: 'i5', theme: 'Product Recommendations', count: 19, sentiment: 'positive', trend: 15, topRequest: 'AI recommendations are very accurate', linkedFeatures: ['AI Recommendations Feature'], color: '#059669' },
    { id: 'i6', theme: 'Account Management', count: 15, sentiment: 'neutral', trend: 2, topRequest: 'Easier way to manage saved addresses', linkedFeatures: ['Guest Checkout', 'Account Settings Epic'], color: '#0891B2' },
  ];

  readonly feedbackItems: FeedbackItem[] = [
    { id: 'f1', source: 'intercom', customer: 'Alex Thompson', customerInitials: 'AT', company: 'RetailCo', sentiment: 'negative', category: 'Checkout Friction', summary: 'Checkout takes too many steps on mobile', verbatim: 'I tried to buy 3 items and had to go through 7 screens. By the time I got to payment I just gave up. Your competitor Shopify does it in 3 taps.', project: 'Aava Commerce', projectColor: '#7C3AED', date: d(0), linkedFeature: 'One-Click Guest Checkout', priority: 'high', votes: 23 },
    { id: 'f2', source: 'g2', customer: 'Maria Santos', customerInitials: 'MS', company: 'FashionHub', sentiment: 'negative', category: 'Payment Options', summary: 'No BNPL option is a dealbreaker', verbatim: 'We lose 30% of our Gen Z customers because you don\'t support Klarna or Afterpay. This is table stakes in 2025. Please add BNPL ASAP.', project: 'Aava Commerce', projectColor: '#7C3AED', date: d(1), linkedFeature: 'Payment Integration Epic', priority: 'high', votes: 18 },
    { id: 'f3', source: 'zendesk', customer: 'James Wu', customerInitials: 'JW', company: 'TechStore', sentiment: 'negative', category: 'Mobile Performance', summary: 'App crashes on Samsung Galaxy S21', verbatim: 'The app crashes every time I try to filter products on my Samsung Galaxy S21. This has been happening for 2 weeks. Very frustrating.', project: 'Aava Commerce', projectColor: '#7C3AED', date: d(2), priority: 'high', votes: 15 },
    { id: 'f4', source: 'survey', customer: 'Emma Clarke', customerInitials: 'EC', company: 'HomeGoods', sentiment: 'positive', category: 'Product Recommendations', summary: 'AI recommendations are spot on', verbatim: 'The product recommendations are incredibly accurate. I\'ve discovered so many products I wouldn\'t have found otherwise. Keep this feature!', project: 'Aava Commerce', projectColor: '#7C3AED', date: d(3), linkedFeature: 'AI Recommendations Feature', priority: 'low', votes: 12 },
    { id: 'f5', source: 'slack', customer: 'David Kim', customerInitials: 'DK', company: 'SportZone', sentiment: 'neutral', category: 'Search & Discovery', summary: 'Search needs natural language support', verbatim: 'When I search for "blue running shoes under $100" I get completely irrelevant results. I have to use multiple filters manually. Natural language search would be a game changer.', project: 'Aava Commerce', projectColor: '#7C3AED', date: d(4), linkedFeature: 'Natural Language Search', priority: 'medium', votes: 9 },
    { id: 'f6', source: 'intercom', customer: 'Sophie Martin', customerInitials: 'SM', company: 'LuxuryBrands', sentiment: 'negative', category: 'Checkout Friction', summary: 'Address autofill doesn\'t work on Safari', verbatim: 'The address autofill completely breaks on Safari. I have to type my full address every single time. This is a basic feature that should work everywhere.', project: 'Aava Commerce', projectColor: '#7C3AED', date: d(5), priority: 'medium', votes: 7 },
  ];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}

  openAddSourceModal(): void {
    this.sourceForm = { type: '', name: '', url: '', apiKey: '' };
    this.showAddSourceModal = true;
  }

  closeAddSourceModal(): void { this.showAddSourceModal = false; }

  get sourceFormValid(): boolean {
    return !!this.sourceForm.type && !!this.sourceForm.name.trim();
  }

  saveSource(): void {
    if (!this.sourceFormValid || this.savingSource) return;
    this.savingSource = true;
    setTimeout(() => {
      this.sources = [...this.sources, {
        id: 'src-' + Date.now(),
        type: this.sourceForm.type as ConnectedSource['type'],
        name: this.sourceForm.name.trim(),
        url: this.sourceForm.url.trim(),
        apiKey: this.sourceForm.apiKey.trim(),
        status: 'active',
        itemCount: 0,
      }];
      this.savingSource = false;
      this.showAddSourceModal = false;
      this.cdr.detectChanges();
    }, 1200);
  }

  removeSource(id: string): void {
    this.sources = this.sources.filter(s => s.id !== id);
  }

  get filtered(): FeedbackItem[] {
    return this.feedbackItems.filter(f =>
      (!this.filterSentiment || f.sentiment === this.filterSentiment) &&
      (!this.filterCategory || f.category === this.filterCategory) &&
      (!this.search || f.summary.toLowerCase().includes(this.search.toLowerCase()) || f.verbatim.toLowerCase().includes(this.search.toLowerCase()))
    );
  }

  get categories(): string[] { return [...new Set(this.feedbackItems.map(f => f.category))]; }
  get mappedFeedback(): FeedbackItem[] { return this.feedbackItems.filter(f => !!f.linkedFeature); }

  get positiveCount(): number { return this.feedbackItems.filter(f => f.sentiment === 'positive').length; }
  get negativeCount(): number { return this.feedbackItems.filter(f => f.sentiment === 'negative').length; }
  get highPriorityCount(): number { return this.feedbackItems.filter(f => f.priority === 'high').length; }

  sentimentColor(s: string): string {
    const m: Record<string, string> = { positive: '#059669', neutral: '#2563EB', negative: '#DC2626' };
    return m[s] ?? '#9CA3AF';
  }

  sentimentIcon(s: string): string {
    const m: Record<string, string> = { positive: 'smile', neutral: 'meh', negative: 'frown' };
    return m[s] ?? 'circle';
  }

  sourceIcon(s: string): string {
    const m: Record<string, string> = { intercom: 'message-circle', zendesk: 'headphones', g2: 'star', slack: 'message-square', survey: 'clipboard-list', email: 'mail' };
    return m[s] ?? 'message-circle';
  }

  sourceColor(s: string): string {
    const m: Record<string, string> = { intercom: '#6366F1', zendesk: '#03363D', g2: '#FF492C', slack: '#4A154B', survey: '#7C3AED', email: '#2563EB' };
    return m[s] ?? '#9CA3AF';
  }

  daysAgo(d: string): string {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff}d ago`;
  }
}
