import { Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, Subject, map, distinctUntilChanged } from 'rxjs';
import { AiMessage, Artifact, ContextAttachment, Conversation } from '../models/psc.models';
import { getArtifactLabel, isChatMode, toArtifactType } from '../constants/artifact-options';
import { buildArtifactContent } from '../constants/artifact-content';
import { ClarifyRequest, clarifyOf, clarifyQuestionsFor, clarifySummary } from '../constants/clarify-questions';

export interface SendMessageOptions {
  artifactId: string;
  /** Context this message is grounded in, as labels ("Decision — Adopt Stripe …", "Jira — ACP-120 …"). */
  contextNames: string[];
  /** The project's lifecycle position and evaluation plan ("Define phase (exit gate: …) · evaluated on …"). */
  lifecycle?: string;
  /** Golden workflow progress, appended to the reply ("Idea to delivery · step 1 of 4 …"). */
  workflowNote?: string;
  /** Draft straight away, without asking clarifying questions first. */
  skipClarify?: boolean;
  /** Build the draft from this request (the original ask plus clarifying answers) instead of the message text. */
  draftPrompt?: string;
  /** Answer lines to echo in the reply ("Using your answers: …"). */
  answerLines?: string[];
  /** Who the chat is shared with ("Checkout squad", "Abdul Sabir"); the first draft says who can see it. */
  sharedWith?: string[];
}

const STORAGE_KEY = 'psc.conversations.v1';
const RESPONSE_DELAY_MS = 1800;
const PROGRESS_TICK_MS = 150;

/**
 * Owns prompt conversations and their history. State lives here (not in the
 * Home component) so history survives navigation between routes and a
 * pending AI response still lands in the right conversation if the user
 * switches chats while it is generating.
 */
@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly conversationsSubject = new BehaviorSubject<Conversation[]>(this.load());
  private readonly pendingSubject = new BehaviorSubject<Set<string>>(new Set());

  /** Signal view of all conversations (unsorted) for signal-based consumers such as the artifact canvas. */
  readonly conversations = toSignal(this.conversationsSubject, { requireSync: true });

  /** Simulated generation progress (0–100) per conversation id while a reply is pending. */
  readonly generationProgress = signal<Record<string, number>>({});
  /** Emits a conversation id each time an assistant reply lands in it. */
  readonly replyArrived = new Subject<string>();

  /** All conversations, most recently updated first. */
  readonly conversations$: Observable<Conversation[]> = this.conversationsSubject.pipe(
    map(list => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  );

  /** Chats that belong to a project, most recent first. */
  forProject(projectId: string): Conversation[] {
    return this.conversationsSubject.value
      .filter(c => c.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversationsSubject.value.find(c => c.id === id);
  }

  watchConversation(id: string): Observable<Conversation | undefined> {
    return this.conversationsSubject.pipe(map(list => list.find(c => c.id === id)));
  }

  isPending$(id: string): Observable<boolean> {
    return this.pendingSubject.pipe(map(set => set.has(id)), distinctUntilChanged());
  }

  isPending(id: string): boolean {
    return this.pendingSubject.value.has(id);
  }

  /** Creates a new conversation from the first prompt and starts the AI reply. */
  startConversation(prompt: string, options: SendMessageOptions & { contextIds: string[]; attachments?: ContextAttachment[]; projectId?: string; workflowId?: string; collaborators?: string[]; teamIds?: string[] }): Conversation {
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: this.createId(),
      title: this.toTitle(prompt),
      artifactId: options.artifactId,
      projectId: options.projectId,
      contextIds: options.contextIds,
      attachments: options.attachments?.length ? options.attachments : undefined,
      workflowId: options.workflowId,
      collaborators: options.collaborators?.length ? [...options.collaborators] : undefined,
      teamIds: options.teamIds?.length ? [...options.teamIds] : undefined,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    this.save([...this.conversationsSubject.value, conversation]);
    this.sendMessage(conversation.id, prompt, options);
    return conversation;
  }

  /** Appends a user message and schedules the (mock) assistant reply. */
  sendMessage(conversationId: string, prompt: string, options: SendMessageOptions): void {
    const text = prompt.trim();
    if (!text || this.isPending(conversationId)) return;

    // Questions are waiting and the user typed instead of using the card: treat the message as the answer.
    const waiting = this.pendingClarify(conversationId);
    if (waiting && !options.skipClarify) {
      const { message, clarify } = waiting;
      this.setClarify(conversationId, message.id, { ...clarify, status: 'answered', note: text });
      options = {
        ...options,
        artifactId: clarify.artifactId,
        skipClarify: true,
        draftPrompt: `${clarify.prompt}\n\nAdditional details: ${text}`,
        answerLines: [`• Notes: ${text}`]
      };
    }

    this.appendMessage(conversationId, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    });
    this.setPending(conversationId, true);

    const startedAt = Date.now();
    const ticker = window.setInterval(() => {
      const pct = Math.min(95, Math.round(((Date.now() - startedAt) / RESPONSE_DELAY_MS) * 100));
      this.generationProgress.update(p => ({ ...p, [conversationId]: pct }));
    }, PROGRESS_TICK_MS);

    window.setTimeout(() => {
      window.clearInterval(ticker);
      const conversation = this.getConversation(conversationId);
      if (conversation) {
        this.appendMessage(conversationId, this.buildReply(conversation, text, options));
      }
      this.generationProgress.update(({ [conversationId]: _done, ...rest }) => rest);
      this.setPending(conversationId, false);
      this.replyArrived.next(conversationId);
    }, RESPONSE_DELAY_MS);
  }

  findArtifact(conversationId: string, artifactId: string): Artifact | undefined {
    return this.getConversation(conversationId)
      ?.messages.flatMap(m => m.artifacts || [])
      .find(a => a.id === artifactId);
  }

  /** Applies `fn` to one artifact inside a conversation and persists the result. */
  updateArtifact(conversationId: string, artifactId: string, fn: (a: Artifact) => Artifact): void {
    this.update(conversationId, c => ({
      ...c,
      updatedAt: new Date().toISOString(),
      messages: c.messages.map(m =>
        m.artifacts?.some(a => a.id === artifactId)
          ? { ...m, artifacts: m.artifacts.map(a => (a.id === artifactId ? fn(a) : a)) }
          : m
      )
    }));
  }

  renameConversation(id: string, title: string): void {
    const trimmed = title.trim();
    if (!trimmed) return;
    this.update(id, c => ({ ...c, title: trimmed }));
  }

  /** Golden workflow (or none) for this chat. */
  setWorkflow(id: string, workflowId: string | null): void {
    this.update(id, c => ({ ...c, workflowId: workflowId ?? undefined }));
  }

  /** Teams added to this chat. */
  setTeams(id: string, teamIds: string[]): void {
    this.update(id, c => ({ ...c, teamIds: teamIds.length ? [...teamIds] : undefined }));
  }

  /** People invited to collaborate on this chat. */
  setCollaborators(id: string, names: string[]): void {
    this.update(id, c => ({ ...c, collaborators: names.length ? [...names] : undefined }));
  }

  /**
   * Note in the chat timeline when someone joins or leaves ("Mobile squad (3 people) joined this chat").
   * Undoing a change right away (add then remove the same team or person) removes the note instead of adding another.
   */
  addMembershipEvent(id: string, subject: string, joined: boolean, detail?: string): void {
    this.update(id, c => {
      const last = c.messages[c.messages.length - 1];
      const ev = last?.role === 'event' ? (last.metadata?.['membership'] as { subject: string; joined: boolean } | undefined) : undefined;
      if (ev && ev.subject === subject && ev.joined !== joined) {
        return { ...c, messages: c.messages.slice(0, -1) };
      }
      const message: AiMessage = {
        id: `event-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        role: 'event',
        content: joined ? `${subject}${detail ? ` (${detail})` : ''} joined this chat` : `${subject} left this chat`,
        timestamp: new Date().toISOString(),
        metadata: { membership: { subject, joined } }
      };
      return { ...c, messages: [...c.messages, message] };
    });
  }

  /** Context grounding a chat changed mid-conversation (Add context / remove) — keep it with the chat. */
  updateContext(id: string, contextIds: string[], attachments: ContextAttachment[]): void {
    this.update(id, c => ({ ...c, contextIds: [...contextIds], attachments: attachments.length ? [...attachments] : undefined }));
  }

  /**
   * Moves a chat into a project (or out of one, with null). Its artifacts move with it, and its context
   * becomes `contextIds` / `attachments` (the caller merges in the project's defaults).
   */
  moveToProject(id: string, projectId: string | null, contextIds: string[], attachments: ContextAttachment[]): void {
    this.update(id, c => ({
      ...c,
      projectId: projectId ?? undefined,
      contextIds: [...contextIds],
      attachments: attachments.length ? [...attachments] : undefined,
      messages: c.messages.map(m => (m.artifacts?.length ? { ...m, artifacts: m.artifacts.map(a => ({ ...a, projectId: projectId ?? '' })) } : m))
    }));
  }

  deleteConversation(id: string): void {
    this.save(this.conversationsSubject.value.filter(c => c.id !== id));
  }

  private appendMessage(id: string, message: AiMessage): void {
    this.update(id, c => ({ ...c, messages: [...c.messages, message], updatedAt: message.timestamp }));
  }

  private update(id: string, fn: (c: Conversation) => Conversation): void {
    this.save(this.conversationsSubject.value.map(c => (c.id === id ? fn(c) : c)));
  }

  private setPending(id: string, pending: boolean): void {
    const next = new Set(this.pendingSubject.value);
    pending ? next.add(id) : next.delete(id);
    this.pendingSubject.next(next);
  }

  /**
   * First reply kicks off the artifact workflow and produces draft artifacts.
   * Follow-ups behave like a normal chat: they refine existing drafts (bumping
   * the version) or add a new draft when a different artifact is selected.
   */
  /** The latest clarifying-questions message still waiting for answers, if any. */
  pendingClarify(conversationId: string): { message: AiMessage; clarify: ClarifyRequest } | null {
    const c = this.getConversation(conversationId);
    if (!c) return null;
    for (let i = c.messages.length - 1; i >= 0; i--) {
      const clarify = clarifyOf(c.messages[i]);
      if (clarify) return clarify.status === 'pending' ? { message: c.messages[i], clarify } : null;
    }
    return null;
  }

  /**
   * Human in the loop: answer (or skip) the clarifying questions, then draft the document from the
   * original request plus the answers. `answers` null = skip and draft with sensible defaults.
   */
  answerClarify(conversationId: string, messageId: string, answers: Record<string, string[]> | null, options: SendMessageOptions): void {
    const c = this.getConversation(conversationId);
    const message = c?.messages.find(m => m.id === messageId);
    const clarify = clarifyOf(message);
    if (!c || !message || !clarify || clarify.status !== 'pending' || this.isPending(conversationId)) return;

    const answered: ClarifyRequest = answers
      ? { ...clarify, status: 'answered', answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v.length)) }
      : { ...clarify, status: 'skipped' };
    this.setClarify(conversationId, messageId, answered);

    const lines = answers ? clarifySummary(answered) : [];
    const label = getArtifactLabel(clarify.artifactId).toLowerCase();
    const userText = lines.length ? `Here are my answers for the ${label}:\n${lines.join('\n')}` : `Skip the questions and draft the ${label} now.`;
    this.sendMessage(conversationId, userText, {
      ...options,
      artifactId: clarify.artifactId,
      skipClarify: true,
      draftPrompt: lines.length ? `${clarify.prompt}\n\n${lines.map(l => l.replace(/^• /, '')).join('; ')}` : clarify.prompt,
      answerLines: lines
    });
  }

  private setClarify(conversationId: string, messageId: string, clarify: ClarifyRequest): void {
    this.update(conversationId, c => ({
      ...c,
      messages: c.messages.map(m => (m.id === messageId ? { ...m, metadata: { ...(m.metadata ?? {}), clarify } } : m))
    }));
  }

  private buildReply(conversation: Conversation, prompt: string, options: SendMessageOptions): AiMessage {
    const previousArtifacts = conversation.messages.flatMap(m => m.artifacts || []);
    const isFirstReply = !conversation.messages.some(m => m.role !== 'user' && m.role !== 'event' && !clarifyOf(m));
    const now = new Date().toISOString();
    const base = {
      id: `assistant-${Date.now()}`,
      role: 'agent' as const,
      agentName: 'Product Studio AI',
      agentAvatar: '✦',
      timestamp: now
    };

    // Human in the loop: the first time a document type is requested in this chat, ask before drafting.
    const draftedType = previousArtifacts.some(a => a.type === toArtifactType(options.artifactId));
    if (!isChatMode(options.artifactId) && !options.skipClarify && !draftedType) {
      const label = getArtifactLabel(options.artifactId).toLowerCase();
      const clarify: ClarifyRequest = { artifactId: options.artifactId, prompt, status: 'pending', questions: clarifyQuestionsFor(options.artifactId) };
      return {
        ...base,
        content: `Before I draft the **${label}**, a few quick questions so it fits what you need. Pick an answer for each (or add your own), then select **Generate**. You can also skip and I’ll use sensible defaults.`,
        metadata: { clarify }
      };
    }

    const reply = this.draftReply(conversation, options.draftPrompt ?? prompt, options, previousArtifacts, isFirstReply, base);
    if (options.answerLines?.length && !isChatMode(options.artifactId)) {
      reply.content += `\n\n**Shaped by your answers:**\n${options.answerLines.join('\n')}`;
    }
    if (options.workflowNote && !isChatMode(options.artifactId)) reply.content += `\n\n${options.workflowNote}`;
    return reply;
  }

  private draftReply(conversation: Conversation, prompt: string, options: SendMessageOptions, previousArtifacts: Artifact[], isFirstReply: boolean,
    base: Pick<AiMessage, 'id' | 'role' | 'agentName' | 'agentAvatar' | 'timestamp'>): AiMessage {
    if (isChatMode(options.artifactId)) {
      return { ...base, content: this.chatReply(prompt, options, isFirstReply, previousArtifacts.length > 0) };
    }

    if (isFirstReply) {
      const n = options.contextNames.length;
      const contextText = n
        ? `\n\n**Grounded in context** (${n} item${n === 1 ? '' : 's'}):\n${options.contextNames.slice(0, 6).map(c => `• ${c}`).join('\n')}${n > 6 ? `\n• …and ${n - 6} more` : ''}`
        : '\n\nNo context was added, so this draft is based on your prompt alone — use **Add context** to ground it in Jira items, Confluence pages, modules, the knowledge base or a file.';
      const lifecycleText = options.lifecycle ? `\n\n**Lifecycle:** ${options.lifecycle}. I’ve aligned this draft to that phase and its success metrics.` : '';
      const shared = options.sharedWith ?? [];
      const sharedText = shared.length
        ? `\n\n**Shared with** ${this.listNames(shared)}. They can see this chat and its drafts.`
        : '';
      return {
        ...base,
        content: `I’ve started your **${getArtifactLabel(options.artifactId).toLowerCase()}** workflow.${contextText}${lifecycleText}${sharedText}\n\nOpen the draft to review, edit, check its version history or publish it — or keep refining it here. Pick a different artifact in the prompt bar to generate it from this conversation.`,
        artifacts: [this.createArtifact(options.artifactId, 1, prompt, conversation.projectId, options.contextNames)]
      };
    }

    const existing = [...previousArtifacts].reverse().find(a => a.type === toArtifactType(options.artifactId));
    const label = getArtifactLabel(options.artifactId);
    if (existing) {
      const version = existing.version + 1;
      return {
        ...base,
        content: `Got it — I’ve updated the **${label.toLowerCase()}** based on “${this.truncate(prompt, 90)}”. This is now **v${version}**.\n\nWant me to tighten another section, or generate the next artifact?`,
        artifacts: [this.refineArtifact(existing, this.createArtifact(options.artifactId, version, prompt, conversation.projectId, options.contextNames), prompt)]
      };
    }

    return {
      ...base,
      content: `Here’s a new **${label.toLowerCase()}** draft built on what we’ve covered so far in this conversation.`,
      artifacts: [this.createArtifact(options.artifactId, 1, prompt, conversation.projectId, options.contextNames)]
    };
  }

  /** Plain conversation (Chat mode): answer in the thread, no draft — offer a document only as a next step. */
  private chatReply(prompt: string, options: SendMessageOptions, isFirstReply: boolean, hasDrafts: boolean): string {
    const topic = this.truncate(prompt.replace(/\s+/g, ' ').trim(), 80);
    const n = options.contextNames.length;
    const grounded = n ? `\n\nI’m using the **${n} context item${n === 1 ? '' : 's'}** you added.` : '';
    const lifecycle = options.lifecycle ? `\n\n**Where the project is:** ${options.lifecycle}.` : '';

    if (isFirstReply) {
      return `Happy to think this through with you. On “${topic}”, here’s where I’d start:\n\n` +
        `• **Who is this for?** The user or team with the problem, and how they handle it today.\n` +
        `• **What does success look like?** One or two outcomes you could measure.\n` +
        `• **What’s fixed?** Deadlines, budget, tech or compliance limits.${grounded}${lifecycle}\n\n` +
        `Tell me more, or ask me anything. When you want a document, choose **PRD**, **Epic**, **Roadmap** or another type from **Chat** in the prompt bar and I’ll draft it from this conversation.`;
    }

    const nudge = hasDrafts
      ? 'Want me to fold this into the draft? Pick its type in the prompt bar and send.'
      : 'Keep going, or pick a document type in the prompt bar when you’re ready to turn this into a draft.';
    return `Got it — “${topic}”. That helps narrow things down.${grounded}\n\n` +
      `My suggestion: settle the riskiest assumption first, then shape the scope around it. ${nudge}`;
  }

  /**
   * An AI refinement is the next version of the same document: keep its title and full version history
   * (so History/Compare show what the AI changed), and send published docs back to review.
   */
  private refineArtifact(previous: Artifact, next: Artifact, prompt: string): Artifact {
    const base = previous.history?.length
      ? previous.history
      : [{ version: previous.version, content: previous.content, savedAt: previous.updatedAt, label: `Version ${previous.version}` }];
    return {
      ...next,
      title: previous.title,
      status: previous.status === 'draft' ? 'draft' : 'review',
      createdAt: previous.createdAt,
      history: [{ version: next.version, content: next.content, savedAt: next.updatedAt, label: `Version ${next.version} (AI: “${this.truncate(prompt, 40)}”)` }, ...base]
    };
  }

  private createArtifact(optionId: string, version: number, prompt: string, projectId?: string, context: string[] = []): Artifact {
    const now = new Date().toISOString();
    const type = toArtifactType(optionId);
    const title = `${getArtifactLabel(optionId)} draft`;
    const content = buildArtifactContent(type, title, prompt, context);
    return {
      id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      content,
      history: [{ version, content, savedAt: now, label: `Version ${version} (generated)` }],
      status: 'draft',
      version,
      createdAt: now,
      updatedAt: now,
      projectId: projectId ?? '',
      tags: []
    };
  }

  private toTitle(prompt: string): string {
    return this.truncate(prompt.replace(/\s+/g, ' ').trim(), 48) || 'New conversation';
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }

  /** "A", "A and B", "A, B and 2 others". */
  private listNames(names: string[]): string {
    const bold = names.map(n => `**${n}**`);
    if (bold.length <= 2) return bold.join(' and ');
    if (bold.length === 3) return `${bold[0]}, ${bold[1]} and ${bold[2]}`;
    return `${bold[0]}, ${bold[1]} and ${bold.length - 2} others`;
  }

  private createId(): string {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  private load(): Conversation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      // Older saves carried relatedArtifactIds (the retired "Related" option) — drop it.
      return Array.isArray(parsed) ? parsed.map(({ relatedArtifactIds: _r, ...c }: Conversation & { relatedArtifactIds?: unknown }) => c) : [];
    } catch {
      return [];
    }
  }

  private save(list: Conversation[]): void {
    this.conversationsSubject.next(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable (private mode / quota) — keep in-memory state */
    }
  }
}
