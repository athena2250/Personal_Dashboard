/**
 * Default structure created on first launch: settings, the four Learning Hub trackers and
 * spending categories. These are configuration, not sample data — no records are created.
 */
import type { Category, EventCategory, FieldDef, Settings, StatusDef, Tracker, WidgetPref } from './models'
import { browserTimezone } from '@/lib/tz'
import { nowISO } from '@/lib/util'

export const SCHEMA_VERSION = 1

export const DEFAULT_WIDGETS: WidgetPref[] = [
  { id: 'quickActions', visible: true },
  { id: 'today', visible: true },
  { id: 'learning', visible: true },
  { id: 'spending', visible: true },
  { id: 'wealth', visible: true },
  { id: 'events', visible: true },
  { id: 'heatmap', visible: true },
  { id: 'trackers', visible: true },
]

export const DEFAULT_EVENT_CATEGORIES: EventCategory[] = [
  { id: 'work', name: 'Work', color: '#3b82f6' },
  { id: 'conference', name: 'Conference', color: '#8b5cf6' },
  { id: 'dev', name: 'Developer event', color: '#6366f1' },
  { id: 'personal', name: 'Personal', color: '#ec4899' },
  { id: 'exam', name: 'Exam', color: '#f59e0b' },
  { id: 'deadline', name: 'Deadline', color: '#ef4444' },
  { id: 'reminder', name: 'Reminder', color: '#14b8a6' },
  { id: 'learning', name: 'Learning', color: '#a855f7' },
  { id: 'imported', name: 'Imported', color: '#64748b' },
]

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    name: '',
    theme: 'system',
    baseCurrency: 'INR',
    timezone: browserTimezone(),
    weekStartsOn: 1,
    dashboardWidgets: DEFAULT_WIDGETS,
    eventCategories: DEFAULT_EVENT_CATEGORIES,
    paymentMethods: ['UPI', 'Credit card', 'Debit card', 'Cash', 'Net banking', 'Wallet', 'Bank transfer'],
    notificationsEnabled: false,
    budgetWarnThreshold: 0.8,
    onboarded: false,
    schemaVersion: SCHEMA_VERSION,
  }
}

const f = (id: string, name: string, type: FieldDef['type'], extra: Partial<FieldDef> = {}): FieldDef => ({
  id,
  name,
  type,
  showInTable: true,
  ...extra,
})

const s = (id: string, name: string, color: string, done = false): StatusDef => ({ id, name, color, done })

const LANGUAGES = ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C', 'Go', 'Rust', 'SQL', 'Kotlin', 'Swift', 'Other']
const DSA_TOPICS = [
  'Arrays',
  'Strings',
  'Hashing',
  'Two pointers',
  'Sliding window',
  'Stacks & queues',
  'Linked lists',
  'Trees',
  'Graphs',
  'Heaps',
  'Binary search',
  'Dynamic programming',
  'Greedy',
  'Backtracking',
  'Math',
  'System design',
  'Other',
]
export const AI_AREAS = ['AI fundamentals', 'Machine Learning', 'Deep Learning', 'Generative AI', 'Agentic AI', 'MLOps', 'Math & statistics']
export const TEST_SECTIONS = [
  'GRE Verbal',
  'GRE Quant',
  'GRE Analytical Writing',
  'TOEFL Reading',
  'TOEFL Listening',
  'TOEFL Speaking',
  'TOEFL Writing',
]

export interface TestPrepConfig {
  targets: { GRE: { verbal: number; quant: number; awa: number }; TOEFL: { reading: number; listening: number; speaking: number; writing: number } }
  testDates: { GRE?: string; TOEFL?: string }
}

export const DEFAULT_TESTPREP_CONFIG: TestPrepConfig = {
  targets: { GRE: { verbal: 160, quant: 165, awa: 4.5 }, TOEFL: { reading: 27, listening: 27, speaking: 25, writing: 26 } },
  testDates: {},
}

type TrackerSeed = Omit<Tracker, 'createdAt' | 'updatedAt'>

export function defaultTrackers(): Tracker[] {
  const now = nowISO()
  const seeds: TrackerSeed[] = [
    {
      id: 'coding',
      name: 'Coding',
      description: 'Programming practice, problems solved and technical skills.',
      icon: 'Code2',
      color: '#8b5cf6',
      section: 'learning',
      template: 'coding',
      countLabel: 'Problems solved',
      recordLabel: 'Resource',
      fields: [
        f('type', 'Type', 'select', { options: ['Problem', 'Repository', 'Course', 'Article', 'Video', 'Book'] }),
        f('url', 'Link', 'url'),
        f('language', 'Language', 'select', { options: LANGUAGES }),
        f('topic', 'Topic', 'select', { options: DSA_TOPICS }),
        f('difficulty', 'Difficulty', 'select', { options: ['Easy', 'Medium', 'Hard'] }),
      ],
      sessionFields: [
        f('language', 'Language', 'select', { options: LANGUAGES }),
        f('topic', 'Topic', 'select', { options: DSA_TOPICS }),
        f('difficulty', 'Difficulty', 'select', { options: ['Easy', 'Medium', 'Hard', 'Mixed'] }),
        f('platform', 'Platform', 'select', { options: ['LeetCode', 'HackerRank', 'Codeforces', 'NeetCode', 'Own project', 'Other'] }),
        f('link', 'Link', 'url', { showInTable: false }),
      ],
      statuses: [s('todo', 'To do', '#64748b'), s('doing', 'In progress', '#3b82f6'), s('done', 'Solved / Done', '#22c55e', true), s('revisit', 'Revisit', '#f59e0b')],
      categories: [],
      view: 'table',
      goals: [
        { id: 'daily-60', title: 'Code 60 minutes a day', metric: 'minutes', period: 'day', target: 60 },
        { id: 'weekly-10', title: 'Solve 10 problems a week', metric: 'count', period: 'week', target: 10 },
      ],
      config: {},
      archived: false,
      order: 0,
    },
    {
      id: 'aiml',
      name: 'AI / ML',
      description: 'AI, Machine Learning, Deep Learning, Generative AI and Agentic AI.',
      icon: 'BrainCircuit',
      color: '#ec4899',
      section: 'learning',
      template: 'aiml',
      countLabel: '',
      recordLabel: 'Topic',
      fields: [
        f('type', 'Type', 'select', { options: ['Course', 'Concept', 'Research paper', 'Project'] }),
        f('area', 'Area', 'select', { options: AI_AREAS }),
        f('provider', 'Source / provider', 'text'),
        f('url', 'Link', 'url'),
        f('projectUrl', 'Project link', 'url', { showInTable: false }),
      ],
      sessionFields: [
        f('area', 'Area', 'select', { options: AI_AREAS }),
        f('activity', 'Activity', 'select', { options: ['Course', 'Reading', 'Paper', 'Project', 'Practice', 'Video'] }),
        f('link', 'Link', 'url', { showInTable: false }),
      ],
      statuses: [s('planned', 'Planned', '#64748b'), s('progress', 'In progress', '#3b82f6'), s('done', 'Completed', '#22c55e', true), s('paused', 'Paused', '#f59e0b')],
      categories: [],
      view: 'cards',
      goals: [{ id: 'weekly-300', title: 'Study 5 hours a week', metric: 'minutes', period: 'week', target: 300 }],
      config: {},
      archived: false,
      order: 1,
    },
    {
      id: 'apps',
      name: 'Coding Applications',
      description: 'Real projects: what you are building, shipping and deploying.',
      icon: 'Rocket',
      color: '#14b8a6',
      section: 'learning',
      template: 'apps',
      countLabel: '',
      recordLabel: 'Project',
      fields: [
        f('stack', 'Tech stack', 'text'),
        f('repoUrl', 'Repository', 'url'),
        f('deployUrl', 'Deployment', 'url'),
        f('description', 'Description', 'longtext', { showInTable: false }),
        f('nextAction', 'Next action', 'text'),
      ],
      sessionFields: [f('activity', 'Activity', 'select', { options: ['Coding', 'Design', 'Debugging', 'Deployment', 'Research', 'Docs'] })],
      statuses: [s('idea', 'Idea', '#64748b'), s('planning', 'Planning', '#8b5cf6'), s('active', 'Building', '#3b82f6'), s('shipped', 'Completed', '#22c55e', true), s('paused', 'Paused', '#f59e0b')],
      categories: ['Web development', 'Automation', 'Data engineering', 'AI applications', 'Mobile', 'Tooling'],
      view: 'cards',
      goals: [{ id: 'weekly-build', title: 'Build 6 hours a week', metric: 'minutes', period: 'week', target: 360 }],
      config: {},
      archived: false,
      order: 2,
    },
    {
      id: 'testprep',
      name: 'GRE / TOEFL',
      description: 'Test prep: practice, mock tests, vocabulary and revision.',
      icon: 'GraduationCap',
      color: '#f59e0b',
      section: 'learning',
      template: 'testprep',
      countLabel: 'Questions practiced',
      recordLabel: 'Topic',
      fields: [
        f('section', 'Section', 'select', { options: TEST_SECTIONS }),
        f('confidence', 'Confidence', 'select', { options: ['Low', 'Medium', 'High'] }),
        f('revisionDate', 'Next revision', 'date'),
      ],
      sessionFields: [
        f('section', 'Section', 'select', { options: TEST_SECTIONS }),
        f('accuracy', 'Accuracy %', 'number'),
        f('source', 'Source', 'text', { showInTable: false }),
      ],
      statuses: [s('todo', 'To study', '#64748b'), s('learning', 'Learning', '#3b82f6'), s('revise', 'Needs revision', '#f59e0b'), s('mastered', 'Mastered', '#22c55e', true)],
      categories: [],
      view: 'table',
      goals: [{ id: 'daily-45', title: 'Study 45 minutes a day', metric: 'minutes', period: 'day', target: 45 }],
      config: DEFAULT_TESTPREP_CONFIG as unknown as Record<string, unknown>,
      archived: false,
      order: 3,
    },
  ]
  return seeds.map((t) => ({ ...t, createdAt: now, updatedAt: now }))
}

const cat = (name: string, color: string, subcategories: string[], type: Category['type'] = 'expense'): Omit<Category, 'id' | 'createdAt' | 'updatedAt'> => ({
  name,
  color,
  subcategories,
  type,
  archived: false,
})

export function defaultCategories(): Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] {
  return [
    cat('Food & Dining', '#f97316', ['Groceries', 'Restaurants', 'Coffee', 'Delivery']),
    cat('Transport', '#0ea5e9', ['Fuel', 'Cab', 'Public transit', 'Parking']),
    cat('Housing', '#8b5cf6', ['Rent', 'Maintenance', 'Furnishing']),
    cat('Utilities', '#14b8a6', ['Electricity', 'Internet', 'Phone', 'Water', 'Gas']),
    cat('Shopping', '#ec4899', ['Clothing', 'Electronics', 'Home']),
    cat('Health', '#22c55e', ['Medicine', 'Doctor', 'Fitness', 'Insurance']),
    cat('Entertainment', '#eab308', ['Movies', 'Events', 'Games']),
    cat('Subscriptions', '#a855f7', ['Streaming', 'Software', 'Cloud']),
    cat('Education', '#6366f1', ['Courses', 'Books', 'Exam fees']),
    cat('Travel', '#06b6d4', ['Flights', 'Hotels', 'Local']),
    cat('Personal care', '#f43f5e', []),
    cat('Gifts & Donations', '#d946ef', []),
    cat('Taxes & Fees', '#78716c', []),
    cat('Other', '#64748b', []),
    cat('Salary', '#10b981', [], 'income'),
    cat('Freelance', '#34d399', [], 'income'),
    cat('Interest & Dividends', '#2dd4bf', [], 'income'),
    cat('Refunds', '#60a5fa', [], 'income'),
    cat('Other income', '#94a3b8', [], 'income'),
  ]
}

export const ICON_CHOICES = [
  'BookOpen',
  'Code2',
  'BrainCircuit',
  'Rocket',
  'GraduationCap',
  'Dumbbell',
  'HeartPulse',
  'Award',
  'Languages',
  'Music',
  'Palette',
  'Camera',
  'Mountain',
  'Bike',
  'Briefcase',
  'Lightbulb',
  'FlaskConical',
  'Globe',
  'PenTool',
  'Target',
  'Trophy',
  'Leaf',
  'Coffee',
  'Star',
] as const

export const COLOR_CHOICES = ['#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#64748b']
