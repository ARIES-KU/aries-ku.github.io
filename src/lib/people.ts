// One place that decides who appears on the site.
// src/data/people.json is committed and holds only people who have consented.
// src/data/people.pending.json is gitignored: on this machine it adds the people who have not consented yet
// (marked `pending`) so the local preview looks complete; on GitHub the file does not exist, so they never appear.
import base from '../data/people.json';

type Member = { initials: string; name: string; name_th: string; topic: string; group: string; consent: boolean; pending?: boolean };
type Group = { label: string; role: string; role_th: string; members: Member[] };

const pendingModules = import.meta.glob('../data/people.pending.json', { eager: true, import: 'default' });
const pendingFile = (Object.values(pendingModules)[0] ?? null) as { roster: Record<string, Member[]> } | null;

export const isPreview = import.meta.env.PUBLIC_PREVIEW === 'true';
export const hasLocalPending = !!pendingFile && Object.values(pendingFile.roster).some((l) => l.length > 0);

export const roster: Group[] = (base.roster as Group[]).map((g) => ({
  ...g,
  members: [
    ...g.members,
    ...((pendingFile?.roster[g.label] ?? []).map((m) => ({ ...m, pending: true }))),
  ],
}));

export const rosterIsEmpty = roster.every((g) => g.members.length === 0);
export const faculty = base.faculty;
export const groups = base.groups as Record<string, { short: string; long: string }>;
export const alumni = base.alumni as { name: string; note: string; year: string }[];
export const supportedBy = base.supportedBy;
export const updated = base.updated;
