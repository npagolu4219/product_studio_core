import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Project, Team, TeamMember } from '../../models/psc.models';
import { TeamsService } from '../../services/teams.service';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { initials, projectGradient } from '../../constants/project-visuals';

type TeamsTab = 'teams' | 'people';

interface TeamForm { name: string; description: string; memberIds: string[]; projectIds: string[]; }
interface MemberForm { name: string; role: string; email: string; skills: string; availability: number; }

/**
 * Teams: the people you work with, grouped into teams. A team assigned to a project collaborates
 * on every chat in it; people or teams can also be added to a single chat from the prompt bar.
 */
@Component({
  selector: 'app-psc-teams',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './teams.component.html',
  styleUrl: './teams.component.scss'
})
export class TeamsComponent {
  readonly teamsSvc = inject(TeamsService);
  private readonly data = inject(PscMockDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly initials = initials;
  readonly projectGradient = projectGradient;

  tab: TeamsTab = this.route.snapshot.queryParamMap.get('tab') === 'people' ? 'people' : 'teams';
  query = '';

  // Dialogs
  dialog: 'team' | 'member' | null = null;
  editingId: string | null = null;
  confirmDelete = false;
  pickerQuery = '';
  teamForm: TeamForm = this.emptyTeam();
  memberForm: MemberForm = this.emptyMember();
  formError = '';
  toast = '';
  private toastTimer = 0;

  get projects(): Project[] {
    return this.data.projects;
  }

  get filteredTeams(): Team[] {
    const q = this.query.trim().toLowerCase();
    return this.teamsSvc.teams().filter(t => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      || this.teamsSvc.membersOf(t).some(m => m.name.toLowerCase().includes(q)));
  }

  get filteredMembers(): TeamMember[] {
    const q = this.query.trim().toLowerCase();
    return this.teamsSvc.members().filter(m => !q || [m.name, m.role, m.email, ...m.skills].some(v => v.toLowerCase().includes(q)));
  }

  setTab(tab: TeamsTab): void {
    this.tab = tab;
    this.query = '';
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: tab === 'people' ? 'people' : null }, replaceUrl: true });
  }

  project(id: string): Project | undefined {
    return this.data.findProject(id);
  }

  projectIndex(id: string): number {
    return Math.max(0, this.projects.findIndex(p => p.id === id));
  }

  /** stroke-dasharray for the availability ring (r = 15). */
  ring(pct: number): string {
    const c = 2 * Math.PI * 15;
    return `${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}`;
  }

  // ── Team dialog ──
  openTeam(team?: Team): void {
    this.dialog = 'team';
    this.editingId = team?.id ?? null;
    this.teamForm = team
      ? { name: team.name, description: team.description, memberIds: [...team.memberIds], projectIds: [...team.projectIds] }
      : this.emptyTeam();
    this.resetDialogState();
  }

  toggleFormMember(id: string): void {
    const ids = this.teamForm.memberIds;
    this.teamForm.memberIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  }

  toggleFormProject(id: string): void {
    const ids = this.teamForm.projectIds;
    this.teamForm.projectIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  }

  get pickerMembers(): TeamMember[] {
    const q = this.pickerQuery.trim().toLowerCase();
    return this.teamsSvc.members().filter(m => !q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
  }

  saveTeam(): void {
    const f = this.teamForm;
    if (!f.name.trim()) { this.formError = 'Give the team a name.'; return; }
    const clash = this.teamsSvc.teams().find(t => t.name.toLowerCase() === f.name.trim().toLowerCase() && t.id !== this.editingId);
    if (clash) { this.formError = `There's already a team called “${clash.name}”.`; return; }
    if (this.editingId) {
      this.teamsSvc.updateTeam(this.editingId, f);
      this.flash(`Saved ${f.name.trim()}`);
    } else {
      this.teamsSvc.addTeam(f);
      this.flash(`Created ${f.name.trim()}`);
    }
    this.closeDialog();
  }

  deleteTeam(): void {
    if (!this.editingId) return;
    const name = this.teamsSvc.team(this.editingId)?.name;
    this.teamsSvc.removeTeam(this.editingId);
    this.flash(`Deleted ${name}`);
    this.closeDialog();
  }

  /** Quick assign from a team card. */
  toggleTeamProject(team: Team, projectId: string): void {
    const on = team.projectIds.includes(projectId);
    this.teamsSvc.toggleProject(team.id, projectId);
    this.flash(`${team.name} ${on ? 'removed from' : 'assigned to'} ${this.project(projectId)?.name}`);
  }

  assignMenuFor: string | null = null;

  // ── Person dialog ──
  openMember(member?: TeamMember): void {
    this.dialog = 'member';
    this.editingId = member?.id ?? null;
    this.memberForm = member
      ? { name: member.name, role: member.role, email: member.email, skills: member.skills.join(', '), availability: member.availability }
      : this.emptyMember();
    this.resetDialogState();
  }

  saveMember(): void {
    const f = this.memberForm;
    if (!f.name.trim()) { this.formError = 'Enter a name.'; return; }
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { this.formError = 'Enter a valid email address, or leave it empty.'; return; }
    const input = { name: f.name, role: f.role || 'Team member', email: f.email, skills: f.skills.split(','), availability: +f.availability || 0 };
    if (this.editingId) {
      this.teamsSvc.updateMember(this.editingId, input);
      this.flash(`Saved ${f.name.trim()}`);
    } else {
      this.teamsSvc.addMember(input);
      this.flash(`Added ${f.name.trim()}`);
    }
    this.closeDialog();
  }

  deleteMember(): void {
    if (!this.editingId) return;
    const name = this.teamsSvc.member(this.editingId)?.name;
    this.teamsSvc.removeMember(this.editingId);
    this.flash(`Removed ${name}`);
    this.closeDialog();
  }

  /** People dialog: which teams this person is in. */
  get editingMemberTeams(): Team[] {
    return this.editingId ? this.teamsSvc.teamsOf(this.editingId) : [];
  }

  closeDialog(): void {
    this.dialog = null;
    this.editingId = null;
    this.confirmDelete = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.assignMenuFor) this.assignMenuFor = null;
    else if (this.dialog) this.closeDialog();
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.assignMenuFor = null;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  private resetDialogState(): void {
    this.confirmDelete = false;
    this.pickerQuery = '';
    this.formError = '';
  }

  private flash(text: string): void {
    this.toast = text;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast = ''), 3500);
  }

  private emptyTeam(): TeamForm {
    return { name: '', description: '', memberIds: [], projectIds: [] };
  }

  private emptyMember(): MemberForm {
    return { name: '', role: '', email: '', skills: '', availability: 100 };
  }
}
