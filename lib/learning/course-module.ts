import { nanoid } from 'nanoid';
import type { SceneOutline } from '@openmaic/generation';

export function planCourseModule(input: {
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  topics: string;
  context: string;
  resources: string;
  existingOrders: number[];
}): SceneOutline[] {
  const topics = input.topics
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!topics.length || topics.length > 30 || topics.some((t) => t.length > 300))
    throw new Error('Enter 1–30 lesson topics, one per line (up to 300 characters each).');
  const start = Math.max(0, ...input.existingOrders);
  return topics.map((topic, index) => ({
    id: nanoid(),
    type: 'slide',
    order: start + index + 1,
    title: `${input.level}: ${topic}`,
    description: `Extend the existing course with a ${input.level.toLowerCase()} lesson on ${topic}. Build on earlier lessons without repeating them. Teach practical reasoning, decisions, debugging, and verification rather than memorizing syntax. Include a concrete worked example and a short learner challenge. Existing course context: ${input.context.slice(0, 6000)}. ${input.resources.trim() ? `Use these learner-provided resources where relevant: ${input.resources.slice(0, 6000)}. Do not invent links or claim to have watched videos.` : ''}`,
    keyPoints: [topic, 'Practical application and tradeoffs', 'Verification and reflection'],
    teachingObjective: `Apply ${topic} at ${input.level.toLowerCase()} level`,
    estimatedDuration: 8,
  }));
}
