/**
 * Skills — reusable markdown instruction modules.
 * Stored as .md files in ~/.hypervibe/skills/
 * Loaded into agent context when relevant to the current task or playbook.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

const SKILLS_DIR = join(homedir(), '.hypervibe', 'skills');

function ensureDir() {
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
}

/**
 * Parse frontmatter from a skill markdown file.
 * Format:
 * ---
 * name: position-sizing
 * description: How I size positions. Use when entering any trade.
 * tags: sizing, risk
 * playbooks: <playbook-id-1>, <playbook-id-2>
 * ---
 * Content here...
 */
function parseSkill(filename, raw) {
  const id = filename.replace('.md', '');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!fmMatch) {
    return { id, name: id, description: '', tags: [], playbooks: [], content: raw, filename };
  }

  const fm = {};
  for (const line of fmMatch[1].split('\n')) {
    const [k, ...v] = line.split(':');
    if (k && v.length) fm[k.trim()] = v.join(':').trim();
  }

  return {
    id,
    name:        fm.name        ?? id,
    description: fm.description ?? '',
    tags:        fm.tags        ? fm.tags.split(',').map(t => t.trim()) : [],
    playbooks:   fm.playbooks   ? fm.playbooks.split(',').map(p => p.trim()).filter(Boolean) : [],
    content:     fmMatch[2].trim(),
    filename,
  };
}

function serializeSkill(skill) {
  const fm = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    skill.tags?.length      ? `tags: ${skill.tags.join(', ')}`      : null,
    skill.playbooks?.length ? `playbooks: ${skill.playbooks.join(', ')}` : null,
    '---',
    '',
    skill.content,
  ].filter(l => l !== null).join('\n');
  return fm;
}

export const Skills = {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  list() {
    ensureDir();
    try {
      return readdirSync(SKILLS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const raw = readFileSync(join(SKILLS_DIR, f), 'utf8');
          return parseSkill(f, raw);
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  },

  get(id) {
    ensureDir();
    const path = join(SKILLS_DIR, `${id}.md`);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    return parseSkill(`${id}.md`, raw);
  },

  create({ name, description = '', content = '', tags = [], playbooks = [] }) {
    ensureDir();
    const id = randomUUID().slice(0, 8);
    const skill = { id, name, description, content, tags, playbooks, filename: `${id}.md` };
    writeFileSync(join(SKILLS_DIR, `${id}.md`), serializeSkill(skill), 'utf8');
    return skill;
  },

  update(id, fields) {
    const skill = this.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    const updated = { ...skill, ...fields, id, filename: `${id}.md` };
    writeFileSync(join(SKILLS_DIR, `${id}.md`), serializeSkill(updated), 'utf8');
    return updated;
  },

  delete(id) {
    const path = join(SKILLS_DIR, `${id}.md`);
    if (existsSync(path)) unlinkSync(path);
  },

  // ── Attach / detach from playbook ──────────────────────────────────────────

  attachToPlaybook(skillId, playbookId) {
    const skill = this.get(skillId);
    if (!skill) return;
    const playbooks = [...new Set([...skill.playbooks, playbookId])];
    return this.update(skillId, { playbooks });
  },

  detachFromPlaybook(skillId, playbookId) {
    const skill = this.get(skillId);
    if (!skill) return;
    const playbooks = skill.playbooks.filter(p => p !== playbookId);
    return this.update(skillId, { playbooks });
  },

  // ── Context injection ──────────────────────────────────────────────────────

  /** Get all skills relevant to a playbook (attached or global) */
  forPlaybook(playbookId) {
    return this.list().filter(s =>
      s.playbooks.length === 0 || s.playbooks.includes(playbookId)
    );
  },

  /** Build a context string of skills to inject into the agent system prompt */
  toContext(playbookId = null) {
    const skills = playbookId ? this.forPlaybook(playbookId) : this.list();
    if (skills.length === 0) return '';

    return [
      '## Skills',
      'The following reusable instruction modules apply to your current context.',
      'Reach for them when the relevant situation arises.',
      '',
      ...skills.map(s => [
        `### ${s.name}`,
        s.description ? `*${s.description}*` : '',
        '',
        s.content,
        '',
      ].join('\n')),
    ].join('\n');
  },
};
