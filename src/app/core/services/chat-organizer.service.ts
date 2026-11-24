import { Injectable, inject, signal } from '@angular/core';
import { ConversationService } from './conversation.service';
import { PscMockDataService } from './psc-mock-data.service';
import { ProductMemoryService } from './product-memory.service';
import { ContextSourcesService } from './context-sources.service';
import { Conversation } from '../models/psc.models';

export interface OrganizerNotice {
  id: number;
  text: string;
  undo?: () => void;
}

/**
 * Files chats into projects. Moving a general ("Recent") chat into a project keeps everything it had and
 * adds that project's context (Product Memory + context set up in the New Project wizard), so the next
 * answers are grounded in the project. Every move can be undone.
 */
@Injectable({ providedIn: 'root' })
export class ChatOrganizerService {
  private readonly conversations = inject(ConversationService);
  private readonly data = inject(PscMockDataService);
  private readonly memory = inject(ProductMemoryService);
  private readonly sources = inject(ContextSourcesService);

  /** Latest feedback for the shell to show (with Undo). */
  readonly notice = signal<OrganizerNotice | null>(null);
  private seq = 0;
  private timer = 0;

  move(conversationId: string, projectId: string | null): void {
    const c = this.conversations.getConversation(conversationId);
    // Every chat belongs to a project: it can move between projects but not out of one.
    if (!c || !projectId || (c.projectId ?? null) === projectId) return;
    const before = { projectId: c.projectId ?? null, contextIds: [...c.contextIds], attachments: [...(c.attachments ?? [])] };
    const project = this.data.findProject(projectId);

    if (projectId && project) {
      const contextIds = [...new Set([...c.contextIds, ...this.memory.defaultsFor(projectId)])];
      const attachments = [...(c.attachments ?? [])];
      for (const a of this.sources.defaultsFor(projectId)) if (!attachments.some(x => x.id === a.id)) attachments.push(a);
      this.conversations.moveToProject(c.id, projectId, contextIds, attachments);
      const added = contextIds.length - c.contextIds.length + attachments.length - (c.attachments?.length ?? 0);
      this.announce(`Moved “${this.short(c.title)}” to ${project.name}${added ? ` · ${added} project context item${added === 1 ? '' : 's'} added` : ''}`, before, c.id);
    } else {
      // Leaving a project: keep only context that isn't tied to the old project.
      const old = before.projectId;
      const projectMemory = new Set(this.memory.defaultsFor(old));
      const projectItems = new Set(this.sources.defaultsFor(old).map(a => a.id));
      this.conversations.moveToProject(c.id, null, c.contextIds.filter(id => !projectMemory.has(id)), (c.attachments ?? []).filter(a => !projectItems.has(a.id)));
      this.announce(`Removed “${this.short(c.title)}” from ${this.data.findProject(old)?.name ?? 'the project'} — it’s in Recent now`, before, c.id);
    }
  }

  /** Projects to offer as move targets (current one excluded), most recently updated first. */
  targets(c: Conversation): { id: string; name: string; index: number }[] {
    return this.data.projects
      .map((p, index) => ({ id: p.id, name: p.name, index, updatedAt: p.updatedAt }))
      .filter(p => p.id !== c.projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, name, index }) => ({ id, name, index }));
  }

  dismiss(): void {
    window.clearTimeout(this.timer);
    this.notice.set(null);
  }

  private announce(text: string, before: { projectId: string | null; contextIds: string[]; attachments: Conversation['attachments'] & {} }, id: string): void {
    const undo = () => {
      this.conversations.moveToProject(id, before.projectId, before.contextIds, before.attachments);
      this.notice.set({ id: ++this.seq, text: 'Move undone' });
      this.autoHide(2500);
    };
    this.notice.set({ id: ++this.seq, text, undo });
    this.autoHide(6000);
  }

  private autoHide(ms: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.notice.set(null), ms);
  }

  private short(t: string): string {
    return t.length > 40 ? t.slice(0, 38) + '…' : t;
  }
}
