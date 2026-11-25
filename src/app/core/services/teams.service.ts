import { Injectable, computed, inject, signal } from '@angular/core';
import { Team, TeamMember } from '../models/psc.models';
import { PscMockDataService } from './psc-mock-data.service';

const STORAGE_KEY = 'psc.teams.v1';

interface TeamsState {
  members: TeamMember[];
  teams: Team[];
}

export type MemberInput = Pick<TeamMember, 'name' | 'role' | 'email' | 'skills' | 'availability'>;
export type TeamInput = Pick<Team, 'name' | 'description' | 'memberIds' | 'projectIds'>;

/**
 * People and teams (Teams page). Teams are assigned to projects, and people or whole teams
 * can be added to a chat from the prompt bar's Team Collaboration. Frontend only (localStorage).
 */
@Injectable({ providedIn: 'root' })
export class TeamsService {
  private readonly data = inject(PscMockDataService);
  private readonly state = signal<TeamsState>(this.load());

  readonly members = computed(() => this.state().members);
  readonly teams = computed(() => this.state().teams);

  member(id: string): TeamMember | undefined {
    return this.members().find(m => m.id === id);
  }

  memberByName(name: string): TeamMember | undefined {
    return this.members().find(m => m.name === name);
  }

  team(id: string): Team | undefined {
    return this.teams().find(t => t.id === id);
  }

  membersOf(team: Team): TeamMember[] {
    return team.memberIds.map(id => this.member(id)).filter((m): m is TeamMember => !!m);
  }

  teamsOf(memberId: string): Team[] {
    return this.teams().filter(t => t.memberIds.includes(memberId));
  }

  /** Teams assigned to a project. */
  teamsForProject(projectId: string | null | undefined): Team[] {
    return projectId ? this.teams().filter(t => t.projectIds.includes(projectId)) : [];
  }

  // ── People ──
  addMember(input: MemberInput): TeamMember {
    const member: TeamMember = { id: `m-${Date.now().toString(36)}`, avatar: initials(input.name), assignedStories: 0, ...clean(input) };
    this.patch(s => ({ ...s, members: [...s.members, member] }));
    return member;
  }

  updateMember(id: string, input: MemberInput): void {
    this.patch(s => ({ ...s, members: s.members.map(m => (m.id === id ? { ...m, ...clean(input), avatar: initials(input.name) } : m)) }));
  }

  /** Removes a person and takes them out of every team. */
  removeMember(id: string): void {
    this.patch(s => ({
      members: s.members.filter(m => m.id !== id),
      teams: s.teams.map(t => ({ ...t, memberIds: t.memberIds.filter(x => x !== id) }))
    }));
  }

  // ── Teams ──
  addTeam(input: TeamInput): Team {
    const team: Team = { id: `team-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), ...input, name: input.name.trim(), description: input.description.trim() };
    this.patch(s => ({ ...s, teams: [...s.teams, team] }));
    return team;
  }

  updateTeam(id: string, input: TeamInput): void {
    this.patch(s => ({ ...s, teams: s.teams.map(t => (t.id === id ? { ...t, ...input, name: input.name.trim(), description: input.description.trim() } : t)) }));
  }

  removeTeam(id: string): void {
    this.patch(s => ({ ...s, teams: s.teams.filter(t => t.id !== id) }));
  }

  /** Assign a team to a project, or take it off. */
  toggleProject(teamId: string, projectId: string): void {
    this.patch(s => ({
      ...s,
      teams: s.teams.map(t => t.id !== teamId ? t : {
        ...t,
        projectIds: t.projectIds.includes(projectId) ? t.projectIds.filter(p => p !== projectId) : [...t.projectIds, projectId]
      })
    }));
  }

  private patch(fn: (s: TeamsState) => TeamsState): void {
    this.state.update(fn);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state())); } catch { /* keep in memory */ }
  }

  private load(): TeamsState {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw && Array.isArray(raw.members) && Array.isArray(raw.teams)) return raw;
    } catch { /* fall through to seed */ }
    return this.seed();
  }

  /** Starts from the people that used to live on Integrations › Team Configurator, grouped into a few teams. */
  private seed(): TeamsState {
    const members = [...this.data.teamMembers];
    const ids = (...names: string[]) => names.map(n => members.find(m => m.name === n)?.id).filter((x): x is string => !!x);
    const now = new Date().toISOString();
    const teams: Team[] = [
      { id: 'team-checkout', name: 'Checkout squad', description: 'Payments, cart and checkout for Aava Commerce.', memberIds: ids('Nagarjuna Pagolu', 'Pooja R', 'Bharath Bobbili', 'Madan Vucha'), projectIds: ['p1'], createdAt: now },
      { id: 'team-mobile', name: 'Mobile squad', description: 'iOS and Android apps.', memberIds: ids('Karthik Goyal', 'Abdul Sabir', 'Vignesh Manivannan'), projectIds: ['p2'], createdAt: now },
      { id: 'team-data', name: 'Data & platform', description: 'Analytics, pipelines and shared services.', memberIds: ids('Prithwish Ghosh', 'Satish Pallapu', 'Preetha Venugopal'), projectIds: ['p3', 'p5'], createdAt: now },
      { id: 'team-design', name: 'Design guild', description: 'Product design and research across projects.', memberIds: ids('Pooja R'), projectIds: [], createdAt: now }
    ].map(t => ({ ...t, projectIds: t.projectIds.filter(p => this.data.findProject(p)) }));
    return { members, teams };
  }
}

function clean(input: MemberInput): MemberInput {
  return {
    name: input.name.trim(),
    role: input.role.trim(),
    email: input.email.trim(),
    skills: input.skills.map(s => s.trim()).filter(Boolean),
    availability: Math.max(0, Math.min(100, Math.round(input.availability)))
  };
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
}
